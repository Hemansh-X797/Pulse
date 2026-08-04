#pragma once
// Phase 1 chat transport: newline-delimited JSON over TCP. Deliberately not
// full WebSocket yet (that's a Phase 2 swap to IXWebSocket for browser
// compatibility) so Phase 1 has zero networking dependencies beyond
// POSIX sockets and compiles anywhere.
//
// Protocol (one JSON object per line):
//   -> {"op":"auth","token":"..."}
//   -> {"op":"send","channel_id":1,"body":"hey :fire:"}
//   -> {"op":"history","channel_id":1,"limit":50}
//   <- {"op":"message","channel_id":1,"sender":"alice","body":"hey \ud83d\udd25","id":12,"ts":123}
//   <- {"op":"error","message":"..."}

#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <atomic>
#include <cstring>
#include <iostream>
#include <mutex>
#include <sstream>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "json.hpp"
#include "../common/db.hpp"
#include "../common/emoji_renderer.hpp"
#include "../common/websocket.hpp"
#include "../auth/auth.hpp"

namespace pulse::chat {

using json = nlohmann::json;

class ChatServer {
public:
    ChatServer(db::Database& db, auth::SessionStore& sessions, int port)
        : db_(db), sessions_(sessions), port_(port) {}

    void run() {
        int server_fd = ::socket(AF_INET, SOCK_STREAM, 0);
        int opt = 1;
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = INADDR_ANY;
        addr.sin_port = htons(port_);

        if (bind(server_fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
            std::cerr << "chat server: bind failed on port " << port_ << "\n";
            return;
        }
        listen(server_fd, 64);
        std::cout << "chat server listening on :" << port_ << "\n";

        while (true) {
            sockaddr_in client_addr{};
            socklen_t len = sizeof(client_addr);
            int client_fd = accept(server_fd, reinterpret_cast<sockaddr*>(&client_addr), &len);
            if (client_fd < 0) continue;
            std::thread(&ChatServer::handle_client, this, client_fd).detach();
        }
    }

private:
    db::Database& db_;
    auth::SessionStore& sessions_;
    int port_;

    std::mutex conn_mu_;
    // channel_id -> set of connected fds subscribed to it (their DM channels)
    std::unordered_map<int64_t, std::unordered_set<int>> channel_subscribers_;
    std::unordered_map<int, int64_t> fd_user_;
    std::unordered_map<int, bool> fd_is_ws_;

    void send_line(int fd, const json& j) {
        std::string s = j.dump();
        bool is_ws;
        {
            std::lock_guard<std::mutex> lock(conn_mu_);
            auto it = fd_is_ws_.find(fd);
            is_ws = it != fd_is_ws_.end() && it->second;
        }
        if (is_ws) {
            auto frame = ws::encode_text_frame(s);
            ::send(fd, frame.data(), frame.size(), 0);
        } else {
            s += "\n";
            ::send(fd, s.data(), s.size(), 0);
        }
    }

    void broadcast_to_channel(int64_t channel_id, const json& payload) {
        std::vector<int> fds;
        {
            std::lock_guard<std::mutex> lock(conn_mu_);
            auto it = channel_subscribers_.find(channel_id);
            if (it == channel_subscribers_.end()) return;
            fds.assign(it->second.begin(), it->second.end());
        }
        for (int fd : fds) send_line(fd, payload);
    }

    void subscribe_user_channels(int fd, int64_t user_id) {
        // naive: subscribe this fd to every channel the user is a member of
        // (fine for Phase 1 scale; Phase 3 indexes this properly with Redis)
        std::lock_guard<std::mutex> lock(conn_mu_);
        fd_user_[fd] = user_id;
    }

    void handle_client(int fd) {
        // Peek enough to decide: raw newline-JSON client, or a browser
        // doing a WebSocket upgrade (starts with "GET ... Upgrade: websocket").
        std::string preamble;
        char chunk[4096];

        // Read until we have a full HTTP request line set (blank line) or
        // it's clearly not HTTP (first bytes aren't "GET").
        ssize_t n = ::recv(fd, chunk, sizeof(chunk), MSG_PEEK);
        if (n <= 0) { ::close(fd); return; }
        std::string peek(chunk, n);

        bool looks_like_http = peek.rfind("GET", 0) == 0;

        if (looks_like_http) {
            // Read the full HTTP request (until \r\n\r\n) for real this time.
            std::string request;
            while (request.find("\r\n\r\n") == std::string::npos) {
                ssize_t got = ::recv(fd, chunk, sizeof(chunk), 0);
                if (got <= 0) { ::close(fd); return; }
                request.append(chunk, got);
                if (request.size() > 16384) break; // guard against runaway headers
            }
            auto resp = ws::build_handshake_response(request);
            if (!resp) {
                // Not a valid WS upgrade; reject politely.
                std::string bad = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n";
                ::send(fd, bad.data(), bad.size(), 0);
                ::close(fd);
                return;
            }
            ::send(fd, resp->data(), resp->size(), 0);
            {
                std::lock_guard<std::mutex> lock(conn_mu_);
                fd_is_ws_[fd] = true;
            }
            run_ws_loop(fd);
        } else {
            run_raw_loop(fd);
        }

        {
            std::lock_guard<std::mutex> lock(conn_mu_);
            for (auto& [cid, fds] : channel_subscribers_) fds.erase(fd);
            fd_user_.erase(fd);
            fd_is_ws_.erase(fd);
        }
        ::close(fd);
    }

    void run_raw_loop(int fd) {
        std::string buf;
        char chunk[4096];
        while (true) {
            ssize_t n = ::recv(fd, chunk, sizeof(chunk), 0);
            if (n <= 0) break;
            buf.append(chunk, n);
            size_t pos;
            while ((pos = buf.find('\n')) != std::string::npos) {
                std::string line = buf.substr(0, pos);
                buf.erase(0, pos + 1);
                if (!line.empty()) handle_message(fd, line);
            }
        }
    }

    void run_ws_loop(int fd) {
        std::vector<uint8_t> buf;
        char chunk[4096];
        while (true) {
            ssize_t n = ::recv(fd, chunk, sizeof(chunk), 0);
            if (n <= 0) break;
            buf.insert(buf.end(), chunk, chunk + n);

            while (true) {
                auto frame = ws::decode_frame(buf);
                if (!frame.ok) break;
                buf.erase(buf.begin(), buf.begin() + frame.bytes_consumed);

                if (frame.opcode == 0x8) { // close
                    auto close_frame = ws::encode_close_frame();
                    ::send(fd, close_frame.data(), close_frame.size(), 0);
                    return;
                } else if (frame.opcode == 0x1) { // text
                    if (!frame.payload.empty()) handle_message(fd, frame.payload);
                }
                // ping/pong (0x9/0xA) intentionally not answered in Phase 1;
                // harmless to ignore for short-lived dev connections.
            }
        }
    }

    void handle_message(int fd, const std::string& line) {
        json req;
        try {
            req = json::parse(line);
        } catch (...) {
            send_line(fd, {{"op", "error"}, {"message", "invalid json"}});
            return;
        }

        std::string op = req.value("op", "");

        if (op == "auth") {
            std::string token = req.value("token", "");
            auto uid = sessions_.resolve(token);
            if (!uid) {
                send_line(fd, {{"op", "error"}, {"message", "invalid token"}});
                return;
            }
            subscribe_user_channels(fd, *uid);
            auto user = db_.get_user(*uid);
            send_line(fd, {{"op", "auth_ok"}, {"user_id", *uid},
                            {"username", user ? user->username : ""}});
            return;
        }

        auto it_user = fd_user_.find(fd);
        if (it_user == fd_user_.end()) {
            send_line(fd, {{"op", "error"}, {"message", "not authenticated"}});
            return;
        }
        int64_t user_id = it_user->second;

        if (op == "join") {
            int64_t channel_id = req.value("channel_id", 0);
            {
                std::lock_guard<std::mutex> lock(conn_mu_);
                channel_subscribers_[channel_id].insert(fd);
            }
            send_line(fd, {{"op", "joined"}, {"channel_id", channel_id}});
            return;
        }

        if (op == "send") {
            int64_t channel_id = req.value("channel_id", 0);
            std::string body = req.value("body", "");
            if (body.empty() || body.size() > 4000) {
                send_line(fd, {{"op", "error"}, {"message", "message body invalid length"}});
                return;
            }
            std::string rendered = emoji::render(body);
            int64_t msg_id = db_.insert_message(channel_id, user_id, body, rendered);
            auto user = db_.get_user(user_id);
            json payload = {
                {"op", "message"},
                {"id", msg_id},
                {"channel_id", channel_id},
                {"sender_id", user_id},
                {"sender", user ? user->username : "?"},
                {"body", rendered},
                {"ts", static_cast<int64_t>(time(nullptr))}
            };
            broadcast_to_channel(channel_id, payload);
            return;
        }

        if (op == "history") {
            int64_t channel_id = req.value("channel_id", 0);
            int limit = req.value("limit", 50);
            auto msgs = db_.recent_messages(channel_id, limit);
            json arr = json::array();
            for (auto& m : msgs) {
                arr.push_back({
                    {"id", m.id}, {"sender", m.sender_username},
                    {"body", m.body_rendered}, {"ts", m.created_at}
                });
            }
            send_line(fd, {{"op", "history"}, {"channel_id", channel_id}, {"messages", arr}});
            return;
        }

        send_line(fd, {{"op", "error"}, {"message", "unknown op: " + op}});
    }
};

} // namespace pulse::chat
