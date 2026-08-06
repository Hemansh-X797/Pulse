#pragma once
// Phase 2 API server: still dependency-free raw sockets (see Phase 1 note
// on swapping to cpp-httplib once this grows further), now with basic
// routing, path params, query strings, and Bearer-token auth so it can
// serve profiles, posts, comments, and reactions alongside signup/login.
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <iostream>
#include <optional>
#include <sstream>
#include <thread>
#include <unordered_map>
#include <vector>

#include "json.hpp"
#include "../common/db.hpp"
#include "../common/emoji_renderer.hpp"
#include "../common/rate_limiter.hpp"
#include "../common/config.hpp"
#include "../common/https_client.hpp"
#include "../auth/auth.hpp"
#include "../auth/oauth.hpp"

namespace pulse::gateway {

using json = nlohmann::json;

class ApiServer {
public:
    ApiServer(db::Database& db, auth::SessionStore& sessions, int port)
        : db_(db), sessions_(sessions), port_(port),
          auth_limiter_(8, 60) {} // 8 signup/login attempts per IP per 60s

    void run() {
        int server_fd = ::socket(AF_INET, SOCK_STREAM, 0);
        int opt = 1;
        setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_addr.s_addr = INADDR_ANY;
        addr.sin_port = htons(port_);
        bind(server_fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr));
        listen(server_fd, 128);
        std::cout << "api server listening on :" << port_ << "\n";
        while (true) {
            int client_fd = accept(server_fd, nullptr, nullptr);
            if (client_fd < 0) continue;
            std::thread(&ApiServer::handle, this, client_fd).detach();
        }
    }

private:
    db::Database& db_;
    auth::SessionStore& sessions_;
    int port_;
    security::RateLimiter auth_limiter_;
    config::OAuthConfig oauth_config_;

    static std::unordered_map<std::string, std::string> parse_query(const std::string& full_path) {
        std::unordered_map<std::string, std::string> out;
        size_t qpos = full_path.find('?');
        if (qpos == std::string::npos) return out;
        std::string qs = full_path.substr(qpos + 1);
        std::stringstream ss(qs);
        std::string pair;
        while (std::getline(ss, pair, '&')) {
            size_t eq = pair.find('=');
            if (eq == std::string::npos) continue;
            std::string key = pair.substr(0, eq);
            std::string val = pair.substr(eq + 1);
            // minimal percent-decode, sufficient for OAuth codes/state
            std::string decoded;
            for (size_t i = 0; i < val.size(); ++i) {
                if (val[i] == '%' && i + 2 < val.size()) {
                    decoded += static_cast<char>(std::strtol(val.substr(i + 1, 2).c_str(), nullptr, 16));
                    i += 2;
                } else if (val[i] == '+') {
                    decoded += ' ';
                } else {
                    decoded += val[i];
                }
            }
            out[key] = decoded;
        }
        return out;
    }

    static std::vector<std::string> split_path(const std::string& path) {
        std::vector<std::string> parts;
        std::stringstream ss(path);
        std::string seg;
        while (std::getline(ss, seg, '/')) if (!seg.empty()) parts.push_back(seg);
        return parts;
    }

    std::optional<int64_t> authed_user(const std::string& request) {
        size_t pos = request.find("Authorization:");
        if (pos == std::string::npos) return std::nullopt;
        size_t start = request.find("Bearer ", pos);
        if (start == std::string::npos) return std::nullopt;
        start += 7;
        size_t end = request.find("\r\n", start);
        std::string token = request.substr(start, end - start);
        return sessions_.resolve(token);
    }

    json user_to_json(const db::User& u) {
        return {
            {"id", u.id}, {"username", u.username}, {"display_name", u.display_name},
            {"bio", u.bio}, {"pronouns", u.pronouns}, {"status_text", u.status_text},
            {"avatar_url", u.avatar_url}, {"banner_url", u.banner_url},
            {"accent_color_top", u.accent_color_top}, {"accent_color_bottom", u.accent_color_bottom},
        };
    }

    json post_to_json(const db::Post& p) {
        return {
            {"id", p.id}, {"author_id", p.author_id}, {"author_username", p.author_username},
            {"author_display_name", p.author_display_name}, {"author_avatar_url", p.author_avatar_url},
            {"body", p.body_rendered}, {"created_at", p.created_at},
            {"reaction_count", p.reaction_count}, {"comment_count", p.comment_count},
        };
    }

    void handle(int fd) {
        sockaddr_in peer{};
        socklen_t peer_len = sizeof(peer);
        std::string client_ip = "unknown";
        if (getpeername(fd, reinterpret_cast<sockaddr*>(&peer), &peer_len) == 0) {
            char buf_ip[INET_ADDRSTRLEN];
            if (inet_ntop(AF_INET, &peer.sin_addr, buf_ip, sizeof(buf_ip))) client_ip = buf_ip;
        }

        std::string request;
        char chunk[8192];
        // Read headers first
        while (request.find("\r\n\r\n") == std::string::npos) {
            ssize_t n = ::recv(fd, chunk, sizeof(chunk), 0);
            if (n <= 0) { ::close(fd); return; }
            request.append(chunk, n);
            if (request.size() > 65536) break;
        }

        std::istringstream first_line(request);
        std::string method, full_path, version;
        first_line >> method >> full_path >> version;

        // Read remaining body if Content-Length says there's more than we have
        size_t header_end = request.find("\r\n\r\n");
        std::string body = header_end != std::string::npos ? request.substr(header_end + 4) : "";
        size_t cl_pos = request.find("Content-Length:");
        if (cl_pos != std::string::npos) {
            size_t cl_start = cl_pos + 15;
            size_t cl_end = request.find("\r\n", cl_start);
            long content_length = std::strtol(request.substr(cl_start, cl_end - cl_start).c_str(), nullptr, 10);
            while (static_cast<long>(body.size()) < content_length) {
                ssize_t n = ::recv(fd, chunk, sizeof(chunk), 0);
                if (n <= 0) break;
                body.append(chunk, n);
            }
        }

        if (method == "OPTIONS") {
            std::string resp = "HTTP/1.1 204 No Content\r\n"
                                "Access-Control-Allow-Origin: *\r\n"
                                "Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS\r\n"
                                "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
                                "Content-Length: 0\r\n\r\n";
            ::send(fd, resp.data(), resp.size(), 0);
            ::close(fd);
            return;
        }

        std::string path = full_path.substr(0, full_path.find('?'));
        auto parts = split_path(path);
        auto query = parse_query(full_path);

        json resp_json;
        int status = 200;
        std::string redirect_to;

        try {
            route(method, parts, query, body, request, client_ip, resp_json, status, redirect_to);
        } catch (const std::exception& e) {
            status = 400;
            resp_json = {{"error", std::string("bad request: ") + e.what()}};
        }

        if (!redirect_to.empty()) {
            std::ostringstream out;
            out << "HTTP/1.1 302 Found\r\n"
                << "Location: " << redirect_to << "\r\n"
                << "Access-Control-Allow-Origin: *\r\n"
                << "Content-Length: 0\r\n"
                << "Connection: close\r\n\r\n";
            std::string out_s = out.str();
            ::send(fd, out_s.data(), out_s.size(), 0);
            ::close(fd);
            return;
        }

        std::string body_out = resp_json.dump();
        std::ostringstream out;
        out << "HTTP/1.1 " << status << " OK\r\n"
            << "Content-Type: application/json\r\n"
            << "Access-Control-Allow-Origin: *\r\n"
            << "Content-Length: " << body_out.size() << "\r\n"
            << "Connection: close\r\n\r\n"
            << body_out;
        std::string out_s = out.str();
        ::send(fd, out_s.data(), out_s.size(), 0);
        ::close(fd);
    }

    void route(const std::string& method, const std::vector<std::string>& parts,
               const std::unordered_map<std::string, std::string>& query,
               const std::string& body, const std::string& request, const std::string& client_ip,
               json& resp_json, int& status, std::string& redirect_to) {
        json in = body.empty() ? json::object() : json::parse(body);

        // GET /auth/google/login  -> redirect to Google's consent screen
        if (method == "GET" && parts.size() == 3 && parts[0] == "auth" && parts[1] == "google" && parts[2] == "login") {
            if (!oauth_config_.google_configured()) {
                status = 501; resp_json = {{"error", "Google sign-in isn't configured on this server yet"}}; return;
            }
            redirect_to = oauth::google_auth_url(oauth_config_, oauth::random_state());
            return;
        }

        // GET /auth/google/callback?code=...
        if (method == "GET" && parts.size() == 3 && parts[0] == "auth" && parts[1] == "google" && parts[2] == "callback") {
            auto it = query.find("code");
            if (it == query.end()) {
                redirect_to = oauth_config_.frontend_url + "/#oauth_error=missing_code";
                return;
            }
            auto result = oauth::handle_google_callback(db_, sessions_, oauth_config_, it->second);
            redirect_to = result.ok
                ? oauth_config_.frontend_url + "/#token=" + result.session_token
                : oauth_config_.frontend_url + "/#oauth_error=" + https::url_encode(result.error);
            return;
        }

        // GET /auth/discord/login -> redirect to Discord's consent screen
        if (method == "GET" && parts.size() == 3 && parts[0] == "auth" && parts[1] == "discord" && parts[2] == "login") {
            if (!oauth_config_.discord_configured()) {
                status = 501; resp_json = {{"error", "Discord sign-in isn't configured on this server yet"}}; return;
            }
            redirect_to = oauth::discord_auth_url(oauth_config_, oauth::random_state());
            return;
        }

        // GET /auth/discord/callback?code=...
        if (method == "GET" && parts.size() == 3 && parts[0] == "auth" && parts[1] == "discord" && parts[2] == "callback") {
            auto it = query.find("code");
            if (it == query.end()) {
                redirect_to = oauth_config_.frontend_url + "/#oauth_error=missing_code";
                return;
            }
            auto result = oauth::handle_discord_callback(db_, sessions_, oauth_config_, it->second);
            redirect_to = result.ok
                ? oauth_config_.frontend_url + "/#token=" + result.session_token
                : oauth_config_.frontend_url + "/#oauth_error=" + https::url_encode(result.error);
            return;
        }

        // POST /signup
        if (method == "POST" && parts.size() == 1 && parts[0] == "signup") {
            if (!auth_limiter_.allow(client_ip)) {
                status = 429; resp_json = {{"error", "too many attempts, try again shortly"}}; return;
            }
            auto result = auth::signup(db_, in.value("username", ""), in.value("display_name", ""), in.value("password", ""));
            if (!result.ok) { status = 400; resp_json = {{"error", result.error}}; return; }
            resp_json = {{"ok", true}, {"user_id", result.user_id}};
            return;
        }

        // POST /login
        if (method == "POST" && parts.size() == 1 && parts[0] == "login") {
            if (!auth_limiter_.allow(client_ip)) {
                status = 429; resp_json = {{"error", "too many attempts, try again shortly"}}; return;
            }
            auto result = auth::login(db_, sessions_, in.value("username", ""), in.value("password", ""));
            if (!result.ok) { status = 401; resp_json = {{"error", result.error}}; return; }
            resp_json = {{"ok", true}, {"user_id", result.user_id}, {"token", result.token}};
            return;
        }

        // GET /health
        if (method == "GET" && parts.size() == 1 && parts[0] == "health") {
            resp_json = {{"status", "ok"}};
            return;
        }

        // GET /users/:username  (public profile lookup)
        if (method == "GET" && parts.size() == 2 && parts[0] == "users") {
            auto u = db_.get_user_by_username(parts[1]);
            if (!u) { status = 404; resp_json = {{"error", "user not found"}}; return; }
            resp_json = user_to_json(*u);
            return;
        }

        // Everything below requires auth
        auto uid = authed_user(request);

        // GET /me
        if (method == "GET" && parts.size() == 1 && parts[0] == "me") {
            if (!uid) { status = 401; resp_json = {{"error", "unauthorized"}}; return; }
            auto u = db_.get_user(*uid);
            resp_json = user_to_json(*u);
            return;
        }

        // PATCH /me  (profile customization — display name, bio, pronouns,
        // status, avatar/banner urls, dual accent-color gradient, theme)
        if (method == "PATCH" && parts.size() == 1 && parts[0] == "me") {
            if (!uid) { status = 401; resp_json = {{"error", "unauthorized"}}; return; }
            auto cur = db_.get_user(*uid);
            std::string display_name = in.value("display_name", cur->display_name);
            std::string bio = emoji::render(in.value("bio", cur->bio));
            std::string pronouns = in.value("pronouns", cur->pronouns);
            std::string status_text = emoji::render(in.value("status_text", cur->status_text));
            std::string avatar_url = in.value("avatar_url", cur->avatar_url);
            std::string banner_url = in.value("banner_url", cur->banner_url);
            std::string accent_top = in.value("accent_color_top", cur->accent_color_top);
            std::string accent_bottom = in.value("accent_color_bottom", cur->accent_color_bottom);
            std::string theme_json = in.value("theme_json", cur->theme_json);
            db_.update_profile(*uid, display_name, bio, pronouns, status_text,
                                avatar_url, banner_url, accent_top, accent_bottom, theme_json);
            auto updated = db_.get_user(*uid);
            resp_json = user_to_json(*updated);
            return;
        }

        // GET /feed?limit=20&offset=0
        if (method == "GET" && parts.size() == 1 && parts[0] == "feed") {
            if (!uid) { status = 401; resp_json = {{"error", "unauthorized"}}; return; }
            auto posts = db_.feed(30, 0);
            json arr = json::array();
            for (auto& p : posts) arr.push_back(post_to_json(p));
            resp_json = {{"posts", arr}};
            return;
        }

        // POST /posts  {"body": "..."}
        if (method == "POST" && parts.size() == 1 && parts[0] == "posts") {
            if (!uid) { status = 401; resp_json = {{"error", "unauthorized"}}; return; }
            std::string raw = in.value("body", "");
            if (raw.empty() || raw.size() > 2000) { status = 400; resp_json = {{"error", "post body invalid length"}}; return; }
            std::string rendered = emoji::render(raw);
            int64_t post_id = db_.create_post(*uid, raw, rendered);
            resp_json = {{"ok", true}, {"post_id", post_id}};
            return;
        }

        // POST /posts/:id/comments  {"body": "..."}
        if (method == "POST" && parts.size() == 3 && parts[0] == "posts" && parts[2] == "comments") {
            if (!uid) { status = 401; resp_json = {{"error", "unauthorized"}}; return; }
            int64_t post_id = std::stoll(parts[1]);
            std::string raw = in.value("body", "");
            if (raw.empty() || raw.size() > 1000) { status = 400; resp_json = {{"error", "comment body invalid length"}}; return; }
            std::string rendered = emoji::render(raw);
            int64_t comment_id = db_.add_comment(post_id, *uid, raw, rendered);
            resp_json = {{"ok", true}, {"comment_id", comment_id}};
            return;
        }

        // GET /posts/:id/comments
        if (method == "GET" && parts.size() == 3 && parts[0] == "posts" && parts[2] == "comments") {
            if (!uid) { status = 401; resp_json = {{"error", "unauthorized"}}; return; }
            int64_t post_id = std::stoll(parts[1]);
            auto comments = db_.list_comments(post_id);
            json arr = json::array();
            for (auto& c : comments) {
                arr.push_back({{"id", c.id}, {"author", c.author_username}, {"body", c.body_rendered}, {"created_at", c.created_at}});
            }
            resp_json = {{"comments", arr}};
            return;
        }

        // POST /posts/:id/react  {"emoji": "🔥"} or {"shortcode": "fire"}
        if (method == "POST" && parts.size() == 3 && parts[0] == "posts" && parts[2] == "react") {
            if (!uid) { status = 401; resp_json = {{"error", "unauthorized"}}; return; }
            int64_t post_id = std::stoll(parts[1]);
            std::string emoji_str = in.value("emoji", "");
            if (emoji_str.empty() && in.contains("shortcode")) {
                emoji_str = emoji::render(":" + in.value("shortcode", "") + ":");
            }
            if (emoji_str.empty()) { status = 400; resp_json = {{"error", "missing emoji"}}; return; }
            db_.add_post_reaction(post_id, *uid, emoji_str);
            auto counts = db_.post_reactions(post_id);
            json arr = json::array();
            for (auto& rc : counts) arr.push_back({{"emoji", rc.emoji}, {"count", rc.count}});
            resp_json = {{"ok", true}, {"reactions", arr}};
            return;
        }

        // GET /posts/:id/reactions
        if (method == "GET" && parts.size() == 3 && parts[0] == "posts" && parts[2] == "reactions") {
            if (!uid) { status = 401; resp_json = {{"error", "unauthorized"}}; return; }
            int64_t post_id = std::stoll(parts[1]);
            auto counts = db_.post_reactions(post_id);
            json arr = json::array();
            for (auto& rc : counts) arr.push_back({{"emoji", rc.emoji}, {"count", rc.count}});
            resp_json = {{"reactions", arr}};
            return;
        }

        // POST /dms  {"with_username": "bob"}  -> creates/reuses a 1:1 DM channel
        if (method == "POST" && parts.size() == 1 && parts[0] == "dms") {
            if (!uid) { status = 401; resp_json = {{"error", "unauthorized"}}; return; }
            std::string other_username = in.value("with_username", "");
            auto other = db_.get_user_by_username(other_username);
            if (!other) { status = 404; resp_json = {{"error", "user not found"}}; return; }
            int64_t channel_id = db_.create_dm_channel(false, "", {*uid, other->id});
            resp_json = {{"ok", true}, {"channel_id", channel_id}};
            return;
        }

        // POST /groups {"name": "...", "member_usernames": ["bob","carol"]}
        if (method == "POST" && parts.size() == 1 && parts[0] == "groups") {
            if (!uid) { status = 401; resp_json = {{"error", "unauthorized"}}; return; }
            std::string name = in.value("name", "New Group");
            std::vector<int64_t> members = {*uid};
            for (auto& uname : in.value("member_usernames", std::vector<std::string>{})) {
                auto m = db_.get_user_by_username(uname);
                if (m) members.push_back(m->id);
            }
            int64_t channel_id = db_.create_dm_channel(true, name, members);
            resp_json = {{"ok", true}, {"channel_id", channel_id}};
            return;
        }

        status = 404;
        resp_json = {{"error", "not found"}};
    }
};

} // namespace pulse::gateway
