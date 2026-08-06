#pragma once
// Real OAuth2 authorization-code flow for Google and Discord. Each
// provider's actual token/userinfo endpoints, called over the OpenSSL
// HTTPS client — nothing simulated. Needs real registered app credentials
// via environment variables (see config.hpp + docs/OAUTH_SETUP.md); with
// no credentials configured, the /auth/*/login route responds with a
// clear "not configured" error instead of pretending to work.
#include <random>
#include <sstream>
#include <string>
#include <cctype>

#include "json.hpp"
#include "../common/config.hpp"
#include "../common/db.hpp"
#include "../common/https_client.hpp"
#include "../auth/auth.hpp"

namespace pulse::oauth {

using json = nlohmann::json;

inline std::string random_state() {
    static thread_local std::mt19937_64 rng(std::random_device{}());
    std::ostringstream oss;
    for (int i = 0; i < 16; ++i) oss << std::hex << (rng() & 0xf);
    return oss.str();
}

// Sanitizes a display name / email-local-part down to our username charset
// (letters, digits, '_', '.'), truncated to a sane length.
inline std::string sanitize_username(const std::string& raw) {
    std::string out;
    for (char c : raw) {
        if (isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '.') out += c;
        if (out.size() >= 20) break;
    }
    if (out.size() < 3) out = "user" + out;
    return out;
}

inline std::string unique_username(db::Database& db, const std::string& base) {
    std::string candidate = base;
    int suffix = 0;
    while (db.username_taken(candidate)) {
        suffix++;
        candidate = base + std::to_string(suffix);
    }
    return candidate;
}

struct OAuthResult { bool ok; std::string error; std::string session_token; };

// ---------------- Google ----------------

inline std::string google_auth_url(const config::OAuthConfig& cfg, const std::string& state) {
    std::ostringstream url;
    url << "https://accounts.google.com/o/oauth2/v2/auth"
        << "?client_id=" << https::url_encode(cfg.google_client_id)
        << "&redirect_uri=" << https::url_encode(cfg.google_redirect_uri)
        << "&response_type=code"
        << "&scope=" << https::url_encode("openid email profile")
        << "&state=" << state;
    return url.str();
}

inline OAuthResult handle_google_callback(db::Database& db, auth::SessionStore& sessions,
                                           const config::OAuthConfig& cfg, const std::string& code) {
    https::Client client;

    std::ostringstream form;
    form << "client_id=" << https::url_encode(cfg.google_client_id)
         << "&client_secret=" << https::url_encode(cfg.google_client_secret)
         << "&code=" << https::url_encode(code)
         << "&grant_type=authorization_code"
         << "&redirect_uri=" << https::url_encode(cfg.google_redirect_uri);

    auto token_resp = client.post_form("oauth2.googleapis.com", "/token", form.str());
    if (token_resp.status != 200) return {false, "Google token exchange failed (" + std::to_string(token_resp.status) + ")"};

    json token_json;
    try { token_json = json::parse(token_resp.body); } catch (...) { return {false, "Google token response was not valid JSON"}; }
    std::string access_token = token_json.value("access_token", "");
    if (access_token.empty()) return {false, "Google did not return an access token"};

    auto info_resp = client.get("www.googleapis.com", "/oauth2/v2/userinfo", access_token);
    if (info_resp.status != 200) return {false, "Google userinfo fetch failed"};

    json info;
    try { info = json::parse(info_resp.body); } catch (...) { return {false, "Google userinfo response was not valid JSON"}; }

    std::string google_id = info.value("id", "");
    std::string email = info.value("email", "");
    std::string name = info.value("name", email.empty() ? google_id : email);
    if (google_id.empty()) return {false, "Google did not return a user id"};

    auto existing = db.find_user_id_by_oauth("google_id", google_id);
    int64_t user_id;
    if (existing) {
        user_id = *existing;
    } else {
        std::string base_username = sanitize_username(!email.empty() ? email.substr(0, email.find('@')) : name);
        std::string username = unique_username(db, base_username);
        auto created = db.create_oauth_user("google_id", google_id, username, name.empty() ? username : name);
        if (!created) return {false, "failed to create account from Google profile"};
        user_id = *created;
    }

    std::string token = sessions.create_session(user_id);
    return {true, "", token};
}

// ---------------- Discord ----------------

inline std::string discord_auth_url(const config::OAuthConfig& cfg, const std::string& state) {
    std::ostringstream url;
    url << "https://discord.com/api/oauth2/authorize"
        << "?client_id=" << https::url_encode(cfg.discord_client_id)
        << "&redirect_uri=" << https::url_encode(cfg.discord_redirect_uri)
        << "&response_type=code"
        << "&scope=" << https::url_encode("identify email")
        << "&state=" << state;
    return url.str();
}

inline OAuthResult handle_discord_callback(db::Database& db, auth::SessionStore& sessions,
                                            const config::OAuthConfig& cfg, const std::string& code) {
    https::Client client;

    std::ostringstream form;
    form << "client_id=" << https::url_encode(cfg.discord_client_id)
         << "&client_secret=" << https::url_encode(cfg.discord_client_secret)
         << "&code=" << https::url_encode(code)
         << "&grant_type=authorization_code"
         << "&redirect_uri=" << https::url_encode(cfg.discord_redirect_uri);

    auto token_resp = client.post_form("discord.com", "/api/oauth2/token", form.str());
    if (token_resp.status != 200) return {false, "Discord token exchange failed (" + std::to_string(token_resp.status) + ")"};

    json token_json;
    try { token_json = json::parse(token_resp.body); } catch (...) { return {false, "Discord token response was not valid JSON"}; }
    std::string access_token = token_json.value("access_token", "");
    if (access_token.empty()) return {false, "Discord did not return an access token"};

    auto info_resp = client.get("discord.com", "/api/users/@me", access_token);
    if (info_resp.status != 200) return {false, "Discord userinfo fetch failed"};

    json info;
    try { info = json::parse(info_resp.body); } catch (...) { return {false, "Discord userinfo response was not valid JSON"}; }

    std::string discord_id = info.value("id", "");
    std::string username_raw = info.value("global_name", info.value("username", discord_id));
    if (discord_id.empty()) return {false, "Discord did not return a user id"};

    auto existing = db.find_user_id_by_oauth("discord_id", discord_id);
    int64_t user_id;
    if (existing) {
        user_id = *existing;
    } else {
        std::string base_username = sanitize_username(username_raw);
        std::string username = unique_username(db, base_username);
        auto created = db.create_oauth_user("discord_id", discord_id, username, username_raw.empty() ? username : username_raw);
        if (!created) return {false, "failed to create account from Discord profile"};
        user_id = *created;
    }

    std::string token = sessions.create_session(user_id);
    return {true, "", token};
}

} // namespace pulse::oauth
