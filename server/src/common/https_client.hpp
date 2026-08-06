#pragma once
// Minimal HTTPS client (OpenSSL BIO-based) for the small set of outbound
// calls OAuth needs: POST a token exchange, GET a userinfo endpoint.
// Not a general-purpose HTTP client — no redirects, no chunked transfer
// beyond what these two providers actually send, no connection reuse.
// That's a deliberate scope choice: this exists to talk to
// accounts.google.com / discord.com and nothing else.
#include <openssl/bio.h>
#include <openssl/err.h>
#include <openssl/ssl.h>

#include <sstream>
#include <stdexcept>
#include <string>
#include <cctype>
#include <cstdlib>
#include <cstring>

namespace pulse::https {

struct Response {
    int status = 0;
    std::string body;
};

class Client {
public:
    Client() {
        ctx_ = SSL_CTX_new(TLS_client_method());
        if (!ctx_) throw std::runtime_error("failed to create SSL context");
        SSL_CTX_set_verify(ctx_, SSL_VERIFY_PEER, nullptr);
        SSL_CTX_set_default_verify_paths(ctx_);
    }
    ~Client() { if (ctx_) SSL_CTX_free(ctx_); }

    Response post_form(const std::string& host, const std::string& path, const std::string& form_body) {
        std::ostringstream req;
        req << "POST " << path << " HTTP/1.1\r\n"
            << "Host: " << host << "\r\n"
            << "User-Agent: PulseServer/1.0\r\n"
            << "Content-Type: application/x-www-form-urlencoded\r\n"
            << "Content-Length: " << form_body.size() << "\r\n"
            << "Accept: application/json\r\n"
            << "Connection: close\r\n\r\n"
            << form_body;
        return request(host, req.str());
    }

    Response get(const std::string& host, const std::string& path, const std::string& bearer_token = "") {
        std::ostringstream req;
        req << "GET " << path << " HTTP/1.1\r\n"
            << "Host: " << host << "\r\n"
            << "User-Agent: PulseServer/1.0\r\n"
            << "Accept: application/json\r\n";
        if (!bearer_token.empty()) req << "Authorization: Bearer " << bearer_token << "\r\n";
        req << "Connection: close\r\n\r\n";
        return request(host, req.str());
    }

private:
    SSL_CTX* ctx_ = nullptr;

    Response request(const std::string& host, const std::string& raw_request) {
        BIO* bio = BIO_new_ssl_connect(ctx_);
        if (!bio) throw std::runtime_error("BIO_new_ssl_connect failed");

        SSL* ssl = nullptr;
        BIO_get_ssl(bio, &ssl);
        SSL_set_tlsext_host_name(ssl, host.c_str()); // SNI — required by most modern hosts
        SSL_set1_host(ssl, host.c_str());            // hostname verification

        std::string conn_str = host + ":443";
        BIO_set_conn_hostname(bio, conn_str.c_str());

        if (BIO_do_connect(bio) <= 0) {
            BIO_free_all(bio);
            throw std::runtime_error("TLS connect failed to " + host);
        }

        BIO_write(bio, raw_request.data(), static_cast<int>(raw_request.size()));

        std::string raw_response;
        char buf[4096];
        int n;
        while ((n = BIO_read(bio, buf, sizeof(buf))) > 0) {
            raw_response.append(buf, n);
        }
        BIO_free_all(bio);

        return parse_response(raw_response);
    }

    Response parse_response(const std::string& raw) {
        Response resp;
        size_t header_end = raw.find("\r\n\r\n");
        if (header_end == std::string::npos) return resp;

        std::string headers = raw.substr(0, header_end);
        std::string rest = raw.substr(header_end + 4);

        // status line: HTTP/1.1 200 OK
        size_t sp1 = headers.find(' ');
        size_t sp2 = headers.find(' ', sp1 + 1);
        if (sp1 != std::string::npos && sp2 != std::string::npos) {
            resp.status = std::atoi(headers.substr(sp1 + 1, sp2 - sp1 - 1).c_str());
        }

        bool chunked = headers.find("Transfer-Encoding: chunked") != std::string::npos
                    || headers.find("transfer-encoding: chunked") != std::string::npos;

        if (chunked) {
            resp.body = dechunk(rest);
        } else {
            resp.body = rest;
        }
        return resp;
    }

    std::string dechunk(const std::string& body) {
        std::string out;
        size_t pos = 0;
        while (pos < body.size()) {
            size_t line_end = body.find("\r\n", pos);
            if (line_end == std::string::npos) break;
            std::string size_hex = body.substr(pos, line_end - pos);
            size_t chunk_size = std::strtoul(size_hex.c_str(), nullptr, 16);
            if (chunk_size == 0) break;
            size_t data_start = line_end + 2;
            if (data_start + chunk_size > body.size()) break;
            out.append(body, data_start, chunk_size);
            pos = data_start + chunk_size + 2; // skip trailing \r\n
        }
        return out;
    }
};

// application/x-www-form-urlencoded encoder for the token exchange body
inline std::string url_encode(const std::string& value) {
    std::ostringstream out;
    for (unsigned char c : value) {
        if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
            out << c;
        } else {
            out << '%' << std::uppercase << std::hex << (static_cast<int>(c) & 0xff) << std::nouppercase << std::dec;
        }
    }
    return out.str();
}

} // namespace pulse::https
