#pragma once
// Calls out to the serverless/ functions over HTTPS, signing each request
// the same way serverless/shared/verify-webhook.js expects to verify it.
// Fire-and-forget by design: notification/thumbnail delivery should never
// block a chat message or API response, so every call here happens on a
// detached thread.
//
// Not wired into the request path by default — call webhook::dispatch(...)
// from wherever a notification/upload happens (e.g. right after
// db_.create_notification(...) in api_server.hpp or chat_server.hpp) once
// PULSE_WEBHOOK_URL and PULSE_WEBHOOK_SECRET are set. Left disconnected
// out of the box so the C++ server has zero hard dependency on any
// serverless deployment existing.
#include <openssl/hmac.h>
#include <iomanip>
#include <sstream>
#include <string>
#include <thread>

#include "config.hpp"
#include "https_client.hpp"
#include "json.hpp"

namespace pulse::webhook {

using json = nlohmann::json;

inline std::string hmac_hex(const std::string& secret, const std::string& body) {
    unsigned char digest[EVP_MAX_MD_SIZE];
    unsigned int digest_len = 0;
    HMAC(EVP_sha256(), secret.data(), static_cast<int>(secret.size()),
         reinterpret_cast<const unsigned char*>(body.data()), body.size(),
         digest, &digest_len);
    std::ostringstream oss;
    for (unsigned int i = 0; i < digest_len; ++i) {
        oss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(digest[i]);
    }
    return oss.str();
}

// Fires a signed POST at a serverless function and does not wait for the
// response — errors are swallowed (logged, not thrown) since a failed
// notification delivery should never take down chat or the API.
inline void dispatch(const std::string& host, const std::string& path, const json& payload) {
    std::string secret = config::env("PULSE_WEBHOOK_SECRET");
    if (secret.empty()) return; // no-op if not configured — see file header

    std::thread([host, path, payload, secret]() {
        try {
            std::string body = payload.dump();
            std::string signature = hmac_hex(secret, body);
            https::Client client;
            // https_client.hpp's post_form sends form-encoded bodies; a
            // dedicated post_json would be a small addition there if this
            // gets wired in for real — left as JSON-shaped intent here so
            // the integration point is obvious.
            client.post_form(host, path, "signature=" + signature + "&payload=" + https::url_encode(body));
        } catch (...) {
            // best-effort — a serverless function being down shouldn't
            // affect the chat/API server at all.
        }
    }).detach();
}

} // namespace pulse::webhook
