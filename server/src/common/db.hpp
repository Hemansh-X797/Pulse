#pragma once
// Postgres-backed data layer (libpqxx). This replaces the earlier SQLite
// version — every method here has the exact same name and signature as
// before, so nothing in api_server.hpp, chat_server.hpp, auth.hpp,
// oauth.hpp, or media_store.hpp had to change to use it. Only the
// implementation (parameterized pqxx queries instead of sqlite3_stmt)
// and the schema dialect (db/schema_postgres.sql instead of
// db/schema.sql) changed.
//
// Connection string comes from PULSE_DATABASE_URL (standard postgres://
// URL — this is exactly what Render, Railway, Supabase, and Heroku all
// hand you for a managed Postgres instance) via config::env(), falling
// back to a local dev default so `./pulse_server` still works out of the
// box against a local Postgres.
#include <pqxx/pqxx>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace pulse::db {

struct User {
    int64_t id;
    std::string username;
    std::string display_name;
    std::string bio;
    std::string pronouns;
    std::string status_text;
    std::string avatar_url;
    std::string banner_url;
    std::string accent_color_top;
    std::string accent_color_bottom;
    std::string theme_json;
};

struct Post {
    int64_t id;
    int64_t author_id;
    std::string author_username;
    std::string author_display_name;
    std::string author_avatar_url;
    std::string body_rendered;
    std::string media_url;
    int64_t created_at;
    int reaction_count = 0;
    int comment_count = 0;
};

struct Comment {
    int64_t id;
    int64_t post_id;
    int64_t author_id;
    std::string author_username;
    std::string body_rendered;
    int64_t created_at;
};

struct Message {
    int64_t id;
    int64_t channel_id;
    int64_t sender_id;
    std::string sender_username;
    std::string body_rendered;
    int64_t reply_to_id = 0;
    int64_t edited_at = 0;
    bool deleted = false;
    int64_t created_at;
};

class Database {
public:
    explicit Database(const std::string& connection_string) : conn_(connection_string) {
        if (!conn_.is_open()) {
            throw std::runtime_error("failed to open postgres connection");
        }
    }

    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    void run_schema(const std::string& schema_sql) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        txn.exec(schema_sql);
        txn.commit();
    }

    // ---- users ----
    std::optional<int64_t> create_user(const std::string& username, const std::string& display_name,
                                        const std::string& password_hash, const std::string& password_salt) {
                                            std::lock_guard<std::mutex> lock(mu_);
        try {
            pqxx::work txn(conn_);
            auto row = txn.exec_params1(
                "INSERT INTO users(username, display_name, password_hash, password_salt, created_at) "
                "VALUES ($1, $2, $3, $4, extract(epoch from now())::bigint) RETURNING id;",
                username, display_name, password_hash, password_salt);
            int64_t id = row[0].as<int64_t>();
            txn.commit();
            return id;
        } catch (const pqxx::sql_error&) {
            return std::nullopt; // most likely a UNIQUE violation on username
        }
    }

    // OAuth-only account: no password, identified by provider + provider_id.
    // `provider_column` must be "google_id" or "discord_id" — trusted
    // caller-side only (interpolated as an identifier, never user input;
    // column names can't be bind parameters in any SQL dialect).
    std::optional<int64_t> create_oauth_user(const std::string& provider_column, const std::string& provider_id,
                                              const std::string& username, const std::string& display_name) {
                                                  std::lock_guard<std::mutex> lock(mu_);
        try {
            pqxx::work txn(conn_);
            std::string sql = "INSERT INTO users(username, display_name, " + provider_column + ", created_at) "
                               "VALUES ($1, $2, $3, extract(epoch from now())::bigint) RETURNING id;";
            auto row = txn.exec_params1(sql, username, display_name, provider_id);
            int64_t id = row[0].as<int64_t>();
            txn.commit();
            return id;
        } catch (const pqxx::sql_error&) {
            return std::nullopt;
        }
    }

    std::optional<int64_t> find_user_id_by_oauth(const std::string& provider_column, const std::string& provider_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        std::string sql = "SELECT id FROM users WHERE " + provider_column + " = $1;";
        pqxx::result r = txn.exec_params(sql, provider_id);
        if (r.empty()) return std::nullopt;
        return r[0][0].as<int64_t>();
    }

    bool username_taken(const std::string& username) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params("SELECT 1 FROM users WHERE username = $1;", username);
        return !r.empty();
    }

    struct AuthRow { int64_t id; std::string password_hash; std::string password_salt; std::string display_name; bool has_password; };

    std::optional<AuthRow> find_user_for_login(const std::string& username) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT id, password_hash, password_salt, display_name FROM users WHERE username = $1;", username);
        if (r.empty()) return std::nullopt;
        auto row = r[0];
        AuthRow out;
        out.id = row[0].as<int64_t>();
        out.has_password = !row[1].is_null() && !row[2].is_null();
        out.password_hash = row[1].is_null() ? "" : row[1].as<std::string>();
        out.password_salt = row[2].is_null() ? "" : row[2].as<std::string>();
        out.display_name = row[3].as<std::string>();
        return out;
    }

    std::optional<User> get_user(int64_t id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT id, username, display_name, bio, pronouns, status_text, "
            "avatar_url, banner_url, accent_color_top, accent_color_bottom, theme_json "
            "FROM users WHERE id = $1;", id);
        if (r.empty()) return std::nullopt;
        return row_to_user(r[0]);
    }

    std::optional<User> get_user_by_username(const std::string& username) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT id, username, display_name, bio, pronouns, status_text, "
            "avatar_url, banner_url, accent_color_top, accent_color_bottom, theme_json "
            "FROM users WHERE username = $1;", username);
        if (r.empty()) return std::nullopt;
        return row_to_user(r[0]);
    }

    bool update_profile(int64_t user_id, const std::string& display_name, const std::string& bio,
                         const std::string& pronouns, const std::string& status_text,
                         const std::string& avatar_url, const std::string& banner_url,
                         const std::string& accent_top, const std::string& accent_bottom,
                         const std::string& theme_json) {
                             std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        auto result = txn.exec_params(
            "UPDATE users SET display_name=$1, bio=$2, pronouns=$3, status_text=$4, "
            "avatar_url=$5, banner_url=$6, accent_color_top=$7, accent_color_bottom=$8, theme_json=$9 "
            "WHERE id=$10;",
            display_name, bio, pronouns, status_text, avatar_url, banner_url, accent_top, accent_bottom, theme_json, user_id);
        txn.commit();
        return result.affected_rows() > 0;
    }

    // ---- posts ----
    int64_t create_post(int64_t author_id, const std::string& body_raw, const std::string& body_rendered, const std::string& media_url = "") {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        auto row = txn.exec_params1(
            "INSERT INTO posts(author_id, body_raw, body_rendered, media_url, created_at) "
            "VALUES ($1, $2, $3, $4, extract(epoch from now())::bigint) RETURNING id;",
            author_id, body_raw, body_rendered, media_url);
        int64_t id = row[0].as<int64_t>();
        txn.commit();
        return id;
    }

    std::optional<int64_t> get_post_author(int64_t post_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params("SELECT author_id FROM posts WHERE id = $1;", post_id);
        if (r.empty()) return std::nullopt;
        return r[0][0].as<int64_t>();
    }

    // Feed: newest-first with a simple engagement boost (reactions + comments),
    // recency-decayed. Phase 4 replaces the scoring function (see
    // serverless/feed-rescore/), not the shape returned here.
    std::vector<Post> feed(int limit, int offset) {
        std::lock_guard<std::mutex> lock(mu_);
        std::vector<Post> out;
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT * FROM ("
            "  SELECT p.id, p.author_id, u.username, u.display_name, u.avatar_url, p.body_rendered, p.media_url, p.created_at, "
            "    (SELECT COUNT(*) FROM post_reactions r WHERE r.post_id = p.id) AS rc, "
            "    (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS cc "
            "  FROM posts p JOIN users u ON u.id = p.author_id"
            ") t "
            "ORDER BY (created_at * 1.0) + (rc + cc * 2) * 3600 DESC "
            "LIMIT $1 OFFSET $2;", limit, offset);
        for (auto row : r) {
            Post p;
            p.id = row[0].as<int64_t>();
            p.author_id = row[1].as<int64_t>();
            p.author_username = row[2].as<std::string>();
            p.author_display_name = row[3].as<std::string>();
            p.author_avatar_url = row[4].is_null() ? "" : row[4].as<std::string>();
            p.body_rendered = row[5].as<std::string>();
            p.media_url = row[6].is_null() ? "" : row[6].as<std::string>();
            p.created_at = row[7].as<int64_t>();
            p.reaction_count = row[8].as<int>();
            p.comment_count = row[9].as<int>();
            out.push_back(p);
        }
        return out;
    }

    // ---- comments ----
    int64_t add_comment(int64_t post_id, int64_t author_id, const std::string& body_raw, const std::string& body_rendered) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        auto row = txn.exec_params1(
            "INSERT INTO post_comments(post_id, author_id, body_raw, body_rendered, created_at) "
            "VALUES ($1, $2, $3, $4, extract(epoch from now())::bigint) RETURNING id;",
            post_id, author_id, body_raw, body_rendered);
        int64_t id = row[0].as<int64_t>();
        txn.commit();
        return id;
    }

    std::vector<Comment> list_comments(int64_t post_id) {
        std::lock_guard<std::mutex> lock(mu_);
        std::vector<Comment> out;
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT c.id, c.post_id, c.author_id, u.username, c.body_rendered, c.created_at "
            "FROM post_comments c JOIN users u ON u.id = c.author_id "
            "WHERE c.post_id = $1 ORDER BY c.id ASC;", post_id);
        for (auto row : r) {
            Comment c;
            c.id = row[0].as<int64_t>();
            c.post_id = row[1].as<int64_t>();
            c.author_id = row[2].as<int64_t>();
            c.author_username = row[3].as<std::string>();
            c.body_rendered = row[4].as<std::string>();
            c.created_at = row[5].as<int64_t>();
            out.push_back(c);
        }
        return out;
    }

    // ---- reactions ----
    bool add_post_reaction(int64_t post_id, int64_t user_id, const std::string& emoji) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        auto result = txn.exec_params(
            "INSERT INTO post_reactions(post_id, user_id, emoji, created_at) "
            "VALUES ($1, $2, $3, extract(epoch from now())::bigint) "
            "ON CONFLICT (post_id, user_id, emoji) DO NOTHING;", post_id, user_id, emoji);
        txn.commit();
        return result.affected_rows() > 0;
    }

    struct ReactionCount { std::string emoji; int count; };
    std::vector<ReactionCount> post_reactions(int64_t post_id) {
        std::lock_guard<std::mutex> lock(mu_);
        std::vector<ReactionCount> out;
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT emoji, COUNT(*) FROM post_reactions WHERE post_id = $1 GROUP BY emoji ORDER BY COUNT(*) DESC;", post_id);
        for (auto row : r) {
            ReactionCount rc;
            rc.emoji = row[0].as<std::string>();
            rc.count = row[1].as<int>();
            out.push_back(rc);
        }
        return out;
    }

    // ---- channels ----
    int64_t create_dm_channel(bool is_group, const std::string& name, const std::vector<int64_t>& member_ids,
                               int64_t server_id = 0, const std::string& topic = "", int position = 0) {
                                   std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        pqxx::result row;
        if (server_id > 0) {
            row = txn.exec_params(
                "INSERT INTO dm_channels(is_group, name, server_id, topic, position, created_at) "
                "VALUES ($1, $2, $3, $4, $5, extract(epoch from now())::bigint) RETURNING id;",
                is_group, name, server_id, topic, position);
        } else {
            row = txn.exec_params(
                "INSERT INTO dm_channels(is_group, name, server_id, topic, position, created_at) "
                "VALUES ($1, $2, NULL, $3, $4, extract(epoch from now())::bigint) RETURNING id;",
                is_group, name, topic, position);
        }
        int64_t channel_id = row[0][0].as<int64_t>();
        for (auto uid : member_ids) {
            txn.exec_params(
                "INSERT INTO dm_members(channel_id, user_id, joined_at) "
                "VALUES ($1, $2, extract(epoch from now())::bigint) ON CONFLICT DO NOTHING;",
                channel_id, uid);
        }
        txn.commit();
        return channel_id;
    }

    std::vector<int64_t> channel_members(int64_t channel_id) {
        std::lock_guard<std::mutex> lock(mu_);
        std::vector<int64_t> ids;
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params("SELECT user_id FROM dm_members WHERE channel_id = $1;", channel_id);
        for (auto row : r) ids.push_back(row[0].as<int64_t>());
        return ids;
    }

    void add_channel_member(int64_t channel_id, int64_t user_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        txn.exec_params(
            "INSERT INTO dm_members(channel_id, user_id, joined_at) "
            "VALUES ($1, $2, extract(epoch from now())::bigint) ON CONFLICT (channel_id, user_id) DO NOTHING;",
            channel_id, user_id);
        txn.commit();
    }

    std::vector<int64_t> list_server_member_ids(int64_t server_id) {
        std::lock_guard<std::mutex> lock(mu_);
        std::vector<int64_t> ids;
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params("SELECT user_id FROM server_members WHERE server_id = $1;", server_id);
        for (auto row : r) ids.push_back(row[0].as<int64_t>());
        return ids;
    }

    // ---- servers ----
    struct Server {
        int64_t id; std::string name; std::string icon_url;
        std::string accent_color_top; std::string accent_color_bottom;
        int64_t owner_id; std::string invite_code;
    };
    struct ServerChannel { int64_t id; std::string name; std::string topic; int position; };

    int64_t create_server(const std::string& name, int64_t owner_id, const std::string& invite_code,
                           const std::string& accent_top = "#5865F2", const std::string& accent_bottom = "#EB459E") {
                               std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        auto row = txn.exec_params1(
            "INSERT INTO servers(name, owner_id, invite_code, accent_color_top, accent_color_bottom, created_at) "
            "VALUES ($1, $2, $3, $4, $5, extract(epoch from now())::bigint) RETURNING id;",
            name, owner_id, invite_code, accent_top, accent_bottom);
        int64_t server_id = row[0].as<int64_t>();
        txn.exec_params(
            "INSERT INTO server_members(server_id, user_id, role, joined_at) "
            "VALUES ($1, $2, 'owner', extract(epoch from now())::bigint);", server_id, owner_id);
        txn.commit();
        return server_id;
    }

    bool add_server_member(int64_t server_id, int64_t user_id, const std::string& role = "member") {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        auto result = txn.exec_params(
            "INSERT INTO server_members(server_id, user_id, role, joined_at) "
            "VALUES ($1, $2, $3, extract(epoch from now())::bigint) "
            "ON CONFLICT (server_id, user_id) DO NOTHING;", server_id, user_id, role);
        txn.commit();
        return result.affected_rows() > 0;
    }

    bool is_server_member(int64_t server_id, int64_t user_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT 1 FROM server_members WHERE server_id = $1 AND user_id = $2;", server_id, user_id);
        return !r.empty();
    }

    std::optional<Server> get_server(int64_t server_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT id, name, icon_url, accent_color_top, accent_color_bottom, owner_id, invite_code "
            "FROM servers WHERE id = $1;", server_id);
        if (r.empty()) return std::nullopt;
        return row_to_server(r[0]);
    }

    std::optional<Server> find_server_by_invite(const std::string& invite_code) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT id, name, icon_url, accent_color_top, accent_color_bottom, owner_id, invite_code "
            "FROM servers WHERE invite_code = $1;", invite_code);
        if (r.empty()) return std::nullopt;
        return row_to_server(r[0]);
    }

    std::vector<Server> list_user_servers(int64_t user_id) {
        std::lock_guard<std::mutex> lock(mu_);
        std::vector<Server> out;
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT s.id, s.name, s.icon_url, s.accent_color_top, s.accent_color_bottom, s.owner_id, s.invite_code "
            "FROM servers s JOIN server_members m ON m.server_id = s.id WHERE m.user_id = $1 ORDER BY s.created_at ASC;",
            user_id);
        for (auto row : r) out.push_back(row_to_server(row));
        return out;
    }

    std::vector<ServerChannel> list_server_channels(int64_t server_id) {
        std::lock_guard<std::mutex> lock(mu_);
        std::vector<ServerChannel> out;
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT id, name, topic, position FROM dm_channels WHERE server_id = $1 ORDER BY position ASC, id ASC;",
            server_id);
        for (auto row : r) {
            ServerChannel c;
            c.id = row[0].as<int64_t>();
            c.name = row[1].as<std::string>();
            c.topic = row[2].is_null() ? "" : row[2].as<std::string>();
            c.position = row[3].as<int>();
            out.push_back(c);
        }
        return out;
    }

    // ---- notifications ----
    struct Notification {
        int64_t id; std::string type; int64_t actor_id; std::string actor_username;
        int64_t channel_id; int64_t post_id; std::string body; bool read; int64_t created_at;
    };

    int64_t create_notification(int64_t user_id, const std::string& type, int64_t actor_id,
                                 const std::string& actor_username, int64_t channel_id, int64_t post_id,
                                 const std::string& body) {
                                     std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        pqxx::row row;
        // Build with conditional NULLs since pqxx params must all bind
        // positionally — simplest correct approach is four branches.
        if (channel_id > 0 && post_id > 0) {
            row = txn.exec_params1(
                "INSERT INTO notifications(user_id, type, actor_id, actor_username, channel_id, post_id, body, created_at) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7, extract(epoch from now())::bigint) RETURNING id;",
                user_id, type, actor_id, actor_username, channel_id, post_id, body);
        } else if (channel_id > 0) {
            row = txn.exec_params1(
                "INSERT INTO notifications(user_id, type, actor_id, actor_username, channel_id, post_id, body, created_at) "
                "VALUES ($1, $2, $3, $4, $5, NULL, $6, extract(epoch from now())::bigint) RETURNING id;",
                user_id, type, actor_id, actor_username, channel_id, body);
        } else if (post_id > 0) {
            row = txn.exec_params1(
                "INSERT INTO notifications(user_id, type, actor_id, actor_username, channel_id, post_id, body, created_at) "
                "VALUES ($1, $2, $3, $4, NULL, $5, $6, extract(epoch from now())::bigint) RETURNING id;",
                user_id, type, actor_id, actor_username, post_id, body);
        } else {
            row = txn.exec_params1(
                "INSERT INTO notifications(user_id, type, actor_id, actor_username, channel_id, post_id, body, created_at) "
                "VALUES ($1, $2, $3, $4, NULL, NULL, $5, extract(epoch from now())::bigint) RETURNING id;",
                user_id, type, actor_id, actor_username, body);
        }
        int64_t id = row[0].as<int64_t>();
        txn.commit();
        return id;
    }

    std::vector<Notification> list_notifications(int64_t user_id, int limit) {
        std::lock_guard<std::mutex> lock(mu_);
        std::vector<Notification> out;
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT id, type, actor_id, actor_username, COALESCE(channel_id,0), COALESCE(post_id,0), body, read, created_at "
            "FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT $2;", user_id, limit);
        for (auto row : r) {
            Notification n;
            n.id = row[0].as<int64_t>();
            n.type = row[1].as<std::string>();
            n.actor_id = row[2].is_null() ? 0 : row[2].as<int64_t>();
            n.actor_username = row[3].as<std::string>();
            n.channel_id = row[4].as<int64_t>();
            n.post_id = row[5].as<int64_t>();
            n.body = row[6].as<std::string>();
            n.read = row[7].as<bool>();
            n.created_at = row[8].as<int64_t>();
            out.push_back(n);
        }
        return out;
    }

    int unread_notification_count(int64_t user_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        auto row = txn.exec_params1("SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false;", user_id);
        return row[0].as<int>();
    }

    void mark_notification_read(int64_t notification_id, int64_t user_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        txn.exec_params("UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2;", notification_id, user_id);
        txn.commit();
    }

    void mark_all_notifications_read(int64_t user_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        txn.exec_params("UPDATE notifications SET read = true WHERE user_id = $1 AND read = false;", user_id);
        txn.commit();
    }

    // ---- messages ----
    int64_t insert_message(int64_t channel_id, int64_t sender_id, const std::string& body_raw,
                            const std::string& body_rendered, int64_t reply_to_id = 0) {
                                std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        pqxx::result row;
        if (reply_to_id > 0) {
            row = txn.exec_params(
                "INSERT INTO messages(channel_id, sender_id, body_raw, body_rendered, reply_to_id, created_at) "
                "VALUES ($1, $2, $3, $4, $5, extract(epoch from now())::bigint) RETURNING id;",
                channel_id, sender_id, body_raw, body_rendered, reply_to_id);
        } else {
            row = txn.exec_params(
                "INSERT INTO messages(channel_id, sender_id, body_raw, body_rendered, reply_to_id, created_at) "
                "VALUES ($1, $2, $3, $4, NULL, extract(epoch from now())::bigint) RETURNING id;",
                channel_id, sender_id, body_raw, body_rendered);
        }
        int64_t id = row[0][0].as<int64_t>();
        txn.commit();
        return id;
    }

    std::vector<Message> recent_messages(int64_t channel_id, int limit) {
        std::lock_guard<std::mutex> lock(mu_);
        std::vector<Message> out;
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT m.id, m.channel_id, m.sender_id, u.username, m.body_rendered, "
            "       COALESCE(m.reply_to_id, 0), COALESCE(m.edited_at, 0), m.deleted, m.created_at "
            "FROM messages m JOIN users u ON u.id = m.sender_id "
            "WHERE m.channel_id = $1 ORDER BY m.id DESC LIMIT $2;", channel_id, limit);
        for (auto row : r) {
            Message m;
            m.id = row[0].as<int64_t>();
            m.channel_id = row[1].as<int64_t>();
            m.sender_id = row[2].as<int64_t>();
            m.sender_username = row[3].as<std::string>();
            m.reply_to_id = row[5].as<int64_t>();
            m.edited_at = row[6].as<int64_t>();
            m.deleted = row[7].as<bool>();
            m.body_rendered = m.deleted ? "" : row[4].as<std::string>();
            m.created_at = row[8].as<int64_t>();
            out.push_back(m);
        }
        return out;
    }

    // Returns the sender_id of a message, or nullopt if it doesn't exist —
    // used to check ownership before allowing edit/delete.
    std::optional<int64_t> message_sender(int64_t message_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params("SELECT sender_id FROM messages WHERE id = $1;", message_id);
        if (r.empty()) return std::nullopt;
        return r[0][0].as<int64_t>();
    }

    bool edit_message(int64_t message_id, const std::string& body_raw, const std::string& body_rendered) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        auto result = txn.exec_params(
            "UPDATE messages SET body_raw = $1, body_rendered = $2, edited_at = extract(epoch from now())::bigint "
            "WHERE id = $3 AND deleted = false;", body_raw, body_rendered, message_id);
        txn.commit();
        return result.affected_rows() > 0;
    }

    bool delete_message(int64_t message_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        auto result = txn.exec_params("UPDATE messages SET deleted = true WHERE id = $1;", message_id);
        txn.commit();
        return result.affected_rows() > 0;
    }

    // ---- read receipts ----
    void mark_read(int64_t channel_id, int64_t user_id, int64_t message_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        txn.exec_params(
            "INSERT INTO read_receipts(channel_id, user_id, last_read_message_id, updated_at) "
            "VALUES ($1, $2, $3, extract(epoch from now())::bigint) "
            "ON CONFLICT (channel_id, user_id) DO UPDATE SET "
            "  last_read_message_id = EXCLUDED.last_read_message_id, updated_at = EXCLUDED.updated_at "
            "WHERE EXCLUDED.last_read_message_id > read_receipts.last_read_message_id;",
            channel_id, user_id, message_id);
        txn.commit();
    }

    int unread_count(int64_t channel_id, int64_t user_id) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::nontransaction txn(conn_);
        auto row = txn.exec_params1(
            "SELECT COUNT(*) FROM messages WHERE channel_id = $1 AND deleted = false AND sender_id != $2 AND id > "
            "  COALESCE((SELECT last_read_message_id FROM read_receipts WHERE channel_id = $1 AND user_id = $2), 0);",
            channel_id, user_id);
        return row[0].as<int>();
    }

    // Channels a user belongs to, each with its unread count — powers a
    // DM sidebar/unread-badge list without N+1 queries from the client.
    struct ChannelUnread { int64_t channel_id; bool is_group; std::string name; int unread; };
    std::vector<ChannelUnread> channels_with_unread(int64_t user_id) {
        std::lock_guard<std::mutex> lock(mu_);
        std::vector<ChannelUnread> out;
        pqxx::nontransaction txn(conn_);
        pqxx::result r = txn.exec_params(
            "SELECT c.id, c.is_group, c.name FROM dm_channels c "
            "JOIN dm_members m ON m.channel_id = c.id WHERE m.user_id = $1;", user_id);
        for (auto row : r) {
            ChannelUnread cu;
            cu.channel_id = row[0].as<int64_t>();
            cu.is_group = row[1].as<bool>();
            cu.name = row[2].is_null() ? "" : row[2].as<std::string>();
            cu.unread = unread_count(cu.channel_id, user_id);
            out.push_back(cu);
        }
        return out;
    }

    // ---- media ----
    void insert_media(const std::string& id, int64_t owner_id, const std::string& mime, int64_t byte_size) {
        std::lock_guard<std::mutex> lock(mu_);
        pqxx::work txn(conn_);
        txn.exec_params(
            "INSERT INTO media(id, owner_id, mime_type, byte_size, created_at) "
            "VALUES ($1, $2, $3, $4, extract(epoch from now())::bigint);", id, owner_id, mime, byte_size);
        txn.commit();
    }

private:
    pqxx::connection conn_;
    // libpqxx connections are NOT thread-safe — only one transaction can
    // be active at a time. The server is heavily multi-threaded
    // (thread-per-connection in both ApiServer and ChatServer), so every
    // public method below takes this lock as its first statement. This
    // serializes DB access but keeps correctness simple; if throughput
    // ever becomes the bottleneck, swap this single connection for a
    // small connection pool (one connection per worker thread) rather
    // than removing the lock.
    mutable std::mutex mu_;

    static User row_to_user(const pqxx::row& row) {
        User u;
        u.id = row[0].as<int64_t>();
        u.username = row[1].as<std::string>();
        u.display_name = row[2].as<std::string>();
        u.bio = row[3].is_null() ? "" : row[3].as<std::string>();
        u.pronouns = row[4].is_null() ? "" : row[4].as<std::string>();
        u.status_text = row[5].is_null() ? "" : row[5].as<std::string>();
        u.avatar_url = row[6].is_null() ? "" : row[6].as<std::string>();
        u.banner_url = row[7].is_null() ? "" : row[7].as<std::string>();
        u.accent_color_top = row[8].as<std::string>();
        u.accent_color_bottom = row[9].as<std::string>();
        u.theme_json = row[10].is_null() ? "{}" : row[10].as<std::string>();
        return u;
    }

    static Server row_to_server(const pqxx::row& row) {
        Server s;
        s.id = row[0].as<int64_t>();
        s.name = row[1].as<std::string>();
        s.icon_url = row[2].is_null() ? "" : row[2].as<std::string>();
        s.accent_color_top = row[3].as<std::string>();
        s.accent_color_bottom = row[4].as<std::string>();
        s.owner_id = row[5].as<int64_t>();
        s.invite_code = row[6].as<std::string>();
        return s;
    }
};

} // namespace pulse::db
