#pragma once
#include <string>
#include <vector>
#include <optional>
#include <stdexcept>
#include "sqlite3.h"

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
    int64_t created_at;
};

class Database {
public:
    explicit Database(const std::string& path) {
        if (sqlite3_open(path.c_str(), &db_) != SQLITE_OK) {
            throw std::runtime_error("failed to open db: " + std::string(sqlite3_errmsg(db_)));
        }
        exec("PRAGMA foreign_keys = ON;");
        exec("PRAGMA journal_mode = WAL;");
    }
    ~Database() { if (db_) sqlite3_close(db_); }

    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    void exec(const std::string& sql) {
        char* err = nullptr;
        if (sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &err) != SQLITE_OK) {
            std::string msg = err ? err : "unknown error";
            sqlite3_free(err);
            throw std::runtime_error("sqlite exec failed: " + msg);
        }
    }

    void run_schema(const std::string& schema_sql) { exec(schema_sql); }

    // ---- users ----
    std::optional<int64_t> create_user(const std::string& username, const std::string& display_name,
                                        const std::string& password_hash, const std::string& password_salt) {
        sqlite3_stmt* stmt;
        const char* sql = "INSERT INTO users(username, display_name, password_hash, password_salt, created_at) "
                           "VALUES (?, ?, ?, ?, strftime('%s','now'));";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return std::nullopt;
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, display_name.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, password_hash.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 4, password_salt.c_str(), -1, SQLITE_TRANSIENT);
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        if (rc != SQLITE_DONE) return std::nullopt;
        return sqlite3_last_insert_rowid(db_);
    }

    struct AuthRow { int64_t id; std::string password_hash; std::string password_salt; std::string display_name; };

    std::optional<AuthRow> find_user_for_login(const std::string& username) {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, password_hash, password_salt, display_name FROM users WHERE username = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return std::nullopt;
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        std::optional<AuthRow> result;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            AuthRow row;
            row.id = sqlite3_column_int64(stmt, 0);
            row.password_hash = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
            row.password_salt = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
            row.display_name = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
            result = row;
        }
        sqlite3_finalize(stmt);
        return result;
    }

    std::optional<User> get_user(int64_t id) {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, username, display_name, bio, pronouns, status_text, "
                           "avatar_url, banner_url, accent_color_top, accent_color_bottom, theme_json "
                           "FROM users WHERE id = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return std::nullopt;
        sqlite3_bind_int64(stmt, 1, id);
        std::optional<User> result;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            result = row_to_user(stmt);
        }
        sqlite3_finalize(stmt);
        return result;
    }

    std::optional<User> get_user_by_username(const std::string& username) {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, username, display_name, bio, pronouns, status_text, "
                           "avatar_url, banner_url, accent_color_top, accent_color_bottom, theme_json "
                           "FROM users WHERE username = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return std::nullopt;
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        std::optional<User> result;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            result = row_to_user(stmt);
        }
        sqlite3_finalize(stmt);
        return result;
    }

    bool update_profile(int64_t user_id, const std::string& display_name, const std::string& bio,
                         const std::string& pronouns, const std::string& status_text,
                         const std::string& avatar_url, const std::string& banner_url,
                         const std::string& accent_top, const std::string& accent_bottom,
                         const std::string& theme_json) {
        sqlite3_stmt* stmt;
        const char* sql = "UPDATE users SET display_name=?, bio=?, pronouns=?, status_text=?, "
                           "avatar_url=?, banner_url=?, accent_color_top=?, accent_color_bottom=?, theme_json=? "
                           "WHERE id=?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return false;
        sqlite3_bind_text(stmt, 1, display_name.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, bio.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, pronouns.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 4, status_text.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 5, avatar_url.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 6, banner_url.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 7, accent_top.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 8, accent_bottom.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 9, theme_json.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 10, user_id);
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return rc == SQLITE_DONE;
    }

    // ---- posts ----
    int64_t create_post(int64_t author_id, const std::string& body_raw, const std::string& body_rendered) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "INSERT INTO posts(author_id, body_raw, body_rendered, created_at) VALUES (?, ?, ?, strftime('%s','now'));",
            -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, author_id);
        sqlite3_bind_text(stmt, 2, body_raw.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, body_rendered.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return sqlite3_last_insert_rowid(db_);
    }

    // Feed: newest-first with a simple engagement boost (reactions + comments),
    // recency-decayed. Phase 3 replaces the scoring function, not the shape.
    std::vector<Post> feed(int limit, int offset) {
        std::vector<Post> out;
        sqlite3_stmt* stmt;
        const char* sql =
            "SELECT p.id, p.author_id, u.username, u.display_name, u.avatar_url, p.body_rendered, p.created_at, "
            "  (SELECT COUNT(*) FROM post_reactions r WHERE r.post_id = p.id) AS rc, "
            "  (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS cc "
            "FROM posts p JOIN users u ON u.id = p.author_id "
            "ORDER BY (p.created_at * 1.0) + (rc + cc * 2) * 3600 DESC "
            "LIMIT ? OFFSET ?;";
        sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, limit);
        sqlite3_bind_int(stmt, 2, offset);
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            Post p;
            p.id = sqlite3_column_int64(stmt, 0);
            p.author_id = sqlite3_column_int64(stmt, 1);
            p.author_username = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
            p.author_display_name = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
            const unsigned char* av = sqlite3_column_text(stmt, 4);
            p.author_avatar_url = av ? reinterpret_cast<const char*>(av) : "";
            p.body_rendered = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 5));
            p.created_at = sqlite3_column_int64(stmt, 6);
            p.reaction_count = sqlite3_column_int(stmt, 7);
            p.comment_count = sqlite3_column_int(stmt, 8);
            out.push_back(p);
        }
        sqlite3_finalize(stmt);
        return out;
    }

    // ---- comments ----
    int64_t add_comment(int64_t post_id, int64_t author_id, const std::string& body_raw, const std::string& body_rendered) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "INSERT INTO post_comments(post_id, author_id, body_raw, body_rendered, created_at) VALUES (?, ?, ?, ?, strftime('%s','now'));",
            -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, post_id);
        sqlite3_bind_int64(stmt, 2, author_id);
        sqlite3_bind_text(stmt, 3, body_raw.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 4, body_rendered.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return sqlite3_last_insert_rowid(db_);
    }

    std::vector<Comment> list_comments(int64_t post_id) {
        std::vector<Comment> out;
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "SELECT c.id, c.post_id, c.author_id, u.username, c.body_rendered, c.created_at "
            "FROM post_comments c JOIN users u ON u.id = c.author_id "
            "WHERE c.post_id = ? ORDER BY c.id ASC;", -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, post_id);
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            Comment c;
            c.id = sqlite3_column_int64(stmt, 0);
            c.post_id = sqlite3_column_int64(stmt, 1);
            c.author_id = sqlite3_column_int64(stmt, 2);
            c.author_username = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
            c.body_rendered = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
            c.created_at = sqlite3_column_int64(stmt, 5);
            out.push_back(c);
        }
        sqlite3_finalize(stmt);
        return out;
    }

    // ---- reactions ----
    bool add_post_reaction(int64_t post_id, int64_t user_id, const std::string& emoji) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "INSERT OR IGNORE INTO post_reactions(post_id, user_id, emoji, created_at) VALUES (?, ?, ?, strftime('%s','now'));",
            -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, post_id);
        sqlite3_bind_int64(stmt, 2, user_id);
        sqlite3_bind_text(stmt, 3, emoji.c_str(), -1, SQLITE_TRANSIENT);
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return rc == SQLITE_DONE;
    }

    struct ReactionCount { std::string emoji; int count; };
    std::vector<ReactionCount> post_reactions(int64_t post_id) {
        std::vector<ReactionCount> out;
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "SELECT emoji, COUNT(*) FROM post_reactions WHERE post_id = ? GROUP BY emoji ORDER BY COUNT(*) DESC;",
            -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, post_id);
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            ReactionCount rc;
            rc.emoji = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
            rc.count = sqlite3_column_int(stmt, 1);
            out.push_back(rc);
        }
        sqlite3_finalize(stmt);
        return out;
    }

private:
    User row_to_user(sqlite3_stmt* stmt) {
        User u;
        u.id = sqlite3_column_int64(stmt, 0);
        u.username = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
        u.display_name = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
        u.bio = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
        u.pronouns = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
        u.status_text = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 5));
        u.avatar_url = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 6));
        u.banner_url = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 7));
        u.accent_color_top = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 8));
        u.accent_color_bottom = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 9));
        u.theme_json = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 10));
        return u;
    }

public:

    // ---- channels ----
    int64_t create_dm_channel(bool is_group, const std::string& name, const std::vector<int64_t>& member_ids) {
        exec("BEGIN;");
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "INSERT INTO dm_channels(is_group, name, created_at) VALUES (?, ?, strftime('%s','now'));", -1, &stmt, nullptr);
        sqlite3_bind_int(stmt, 1, is_group ? 1 : 0);
        sqlite3_bind_text(stmt, 2, name.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        int64_t channel_id = sqlite3_last_insert_rowid(db_);
        for (auto uid : member_ids) {
            sqlite3_stmt* mstmt;
            sqlite3_prepare_v2(db_, "INSERT INTO dm_members(channel_id, user_id, joined_at) VALUES (?, ?, strftime('%s','now'));", -1, &mstmt, nullptr);
            sqlite3_bind_int64(mstmt, 1, channel_id);
            sqlite3_bind_int64(mstmt, 2, uid);
            sqlite3_step(mstmt);
            sqlite3_finalize(mstmt);
        }
        exec("COMMIT;");
        return channel_id;
    }

    std::vector<int64_t> channel_members(int64_t channel_id) {
        std::vector<int64_t> ids;
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "SELECT user_id FROM dm_members WHERE channel_id = ?;", -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, channel_id);
        while (sqlite3_step(stmt) == SQLITE_ROW) ids.push_back(sqlite3_column_int64(stmt, 0));
        sqlite3_finalize(stmt);
        return ids;
    }

    // ---- messages ----
    int64_t insert_message(int64_t channel_id, int64_t sender_id, const std::string& body_raw, const std::string& body_rendered) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "INSERT INTO messages(channel_id, sender_id, body_raw, body_rendered, created_at) VALUES (?, ?, ?, ?, strftime('%s','now'));",
            -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, channel_id);
        sqlite3_bind_int64(stmt, 2, sender_id);
        sqlite3_bind_text(stmt, 3, body_raw.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 4, body_rendered.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return sqlite3_last_insert_rowid(db_);
    }

    std::vector<Message> recent_messages(int64_t channel_id, int limit) {
        std::vector<Message> out;
        sqlite3_stmt* stmt;
        const char* sql =
            "SELECT m.id, m.channel_id, m.sender_id, u.username, m.body_rendered, m.created_at "
            "FROM messages m JOIN users u ON u.id = m.sender_id "
            "WHERE m.channel_id = ? ORDER BY m.id DESC LIMIT ?;";
        sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, channel_id);
        sqlite3_bind_int(stmt, 2, limit);
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            Message m;
            m.id = sqlite3_column_int64(stmt, 0);
            m.channel_id = sqlite3_column_int64(stmt, 1);
            m.sender_id = sqlite3_column_int64(stmt, 2);
            m.sender_username = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
            m.body_rendered = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
            m.created_at = sqlite3_column_int64(stmt, 5);
            out.push_back(m);
        }
        sqlite3_finalize(stmt);
        return out;
    }

private:
    sqlite3* db_ = nullptr;
};

} // namespace pulse::db
