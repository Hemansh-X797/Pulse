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

    // OAuth-only account: no password, identified by provider + provider_id.
    // `provider` must be "google_id" or "discord_id" (column name, trusted
    // caller-side only — never pass user input here).
    std::optional<int64_t> create_oauth_user(const std::string& provider_column, const std::string& provider_id,
                                              const std::string& username, const std::string& display_name) {
        std::string sql = "INSERT INTO users(username, display_name, " + provider_column + ", created_at) "
                           "VALUES (?, ?, ?, strftime('%s','now'));";
        sqlite3_stmt* stmt;
        if (sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) return std::nullopt;
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, display_name.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, provider_id.c_str(), -1, SQLITE_TRANSIENT);
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        if (rc != SQLITE_DONE) return std::nullopt;
        return sqlite3_last_insert_rowid(db_);
    }

    std::optional<int64_t> find_user_id_by_oauth(const std::string& provider_column, const std::string& provider_id) {
        std::string sql = "SELECT id FROM users WHERE " + provider_column + " = ?;";
        sqlite3_stmt* stmt;
        if (sqlite3_prepare_v2(db_, sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) return std::nullopt;
        sqlite3_bind_text(stmt, 1, provider_id.c_str(), -1, SQLITE_TRANSIENT);
        std::optional<int64_t> result;
        if (sqlite3_step(stmt) == SQLITE_ROW) result = sqlite3_column_int64(stmt, 0);
        sqlite3_finalize(stmt);
        return result;
    }

    bool username_taken(const std::string& username) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "SELECT 1 FROM users WHERE username = ?;", -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        bool taken = sqlite3_step(stmt) == SQLITE_ROW;
        sqlite3_finalize(stmt);
        return taken;
    }

    struct AuthRow { int64_t id; std::string password_hash; std::string password_salt; std::string display_name; bool has_password; };

    std::optional<AuthRow> find_user_for_login(const std::string& username) {
        sqlite3_stmt* stmt;
        const char* sql = "SELECT id, password_hash, password_salt, display_name FROM users WHERE username = ?;";
        if (sqlite3_prepare_v2(db_, sql, -1, &stmt, nullptr) != SQLITE_OK) return std::nullopt;
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
        std::optional<AuthRow> result;
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            AuthRow row;
            row.id = sqlite3_column_int64(stmt, 0);
            const unsigned char* hash = sqlite3_column_text(stmt, 1);
            const unsigned char* salt = sqlite3_column_text(stmt, 2);
            row.has_password = hash != nullptr && salt != nullptr;
            row.password_hash = hash ? reinterpret_cast<const char*>(hash) : "";
            row.password_salt = salt ? reinterpret_cast<const char*>(salt) : "";
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
    int64_t create_post(int64_t author_id, const std::string& body_raw, const std::string& body_rendered, const std::string& media_url = "") {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "INSERT INTO posts(author_id, body_raw, body_rendered, media_url, created_at) VALUES (?, ?, ?, ?, strftime('%s','now'));",
            -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, author_id);
        sqlite3_bind_text(stmt, 2, body_raw.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 3, body_rendered.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 4, media_url.c_str(), -1, SQLITE_TRANSIENT);
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
            "SELECT p.id, p.author_id, u.username, u.display_name, u.avatar_url, p.body_rendered, p.media_url, p.created_at, "
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
            const unsigned char* mu = sqlite3_column_text(stmt, 6);
            p.media_url = mu ? reinterpret_cast<const char*>(mu) : "";
            p.created_at = sqlite3_column_int64(stmt, 7);
            p.reaction_count = sqlite3_column_int(stmt, 8);
            p.comment_count = sqlite3_column_int(stmt, 9);
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
    int64_t insert_message(int64_t channel_id, int64_t sender_id, const std::string& body_raw, const std::string& body_rendered, int64_t reply_to_id = 0) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "INSERT INTO messages(channel_id, sender_id, body_raw, body_rendered, reply_to_id, created_at) VALUES (?, ?, ?, ?, ?, strftime('%s','now'));",
            -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, channel_id);
        sqlite3_bind_int64(stmt, 2, sender_id);
        sqlite3_bind_text(stmt, 3, body_raw.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 4, body_rendered.c_str(), -1, SQLITE_TRANSIENT);
        if (reply_to_id > 0) sqlite3_bind_int64(stmt, 5, reply_to_id); else sqlite3_bind_null(stmt, 5);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return sqlite3_last_insert_rowid(db_);
    }

    std::vector<Message> recent_messages(int64_t channel_id, int limit) {
        std::vector<Message> out;
        sqlite3_stmt* stmt;
        const char* sql =
            "SELECT m.id, m.channel_id, m.sender_id, u.username, m.body_rendered, "
            "       COALESCE(m.reply_to_id, 0), COALESCE(m.edited_at, 0), m.deleted, m.created_at "
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
            m.reply_to_id = sqlite3_column_int64(stmt, 5);
            m.edited_at = sqlite3_column_int64(stmt, 6);
            m.deleted = sqlite3_column_int(stmt, 7) != 0;
            m.body_rendered = m.deleted ? "" : reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
            m.created_at = sqlite3_column_int64(stmt, 8);
            out.push_back(m);
        }
        sqlite3_finalize(stmt);
        return out;
    }

    // Returns the sender_id of a message, or nullopt if it doesn't exist —
    // used to check ownership before allowing edit/delete.
    std::optional<int64_t> message_sender(int64_t message_id) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "SELECT sender_id FROM messages WHERE id = ?;", -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, message_id);
        std::optional<int64_t> result;
        if (sqlite3_step(stmt) == SQLITE_ROW) result = sqlite3_column_int64(stmt, 0);
        sqlite3_finalize(stmt);
        return result;
    }

    bool edit_message(int64_t message_id, const std::string& body_raw, const std::string& body_rendered) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "UPDATE messages SET body_raw = ?, body_rendered = ?, edited_at = strftime('%s','now') WHERE id = ? AND deleted = 0;",
            -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, body_raw.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_text(stmt, 2, body_rendered.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 3, message_id);
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return rc == SQLITE_DONE;
    }

    bool delete_message(int64_t message_id) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_, "UPDATE messages SET deleted = 1 WHERE id = ?;", -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, message_id);
        int rc = sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        return rc == SQLITE_DONE;
    }

    // ---- read receipts ----
    void mark_read(int64_t channel_id, int64_t user_id, int64_t message_id) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "INSERT INTO read_receipts(channel_id, user_id, last_read_message_id, updated_at) VALUES (?, ?, ?, strftime('%s','now')) "
            "ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at "
            "WHERE excluded.last_read_message_id > read_receipts.last_read_message_id;",
            -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, channel_id);
        sqlite3_bind_int64(stmt, 2, user_id);
        sqlite3_bind_int64(stmt, 3, message_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

    int unread_count(int64_t channel_id, int64_t user_id) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "SELECT COUNT(*) FROM messages WHERE channel_id = ? AND deleted = 0 AND sender_id != ? AND id > "
            "  COALESCE((SELECT last_read_message_id FROM read_receipts WHERE channel_id = ? AND user_id = ?), 0);",
            -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, channel_id);
        sqlite3_bind_int64(stmt, 2, user_id);
        sqlite3_bind_int64(stmt, 3, channel_id);
        sqlite3_bind_int64(stmt, 4, user_id);
        int count = 0;
        if (sqlite3_step(stmt) == SQLITE_ROW) count = sqlite3_column_int(stmt, 0);
        sqlite3_finalize(stmt);
        return count;
    }

    // Channels a user belongs to, each with its unread count — powers a
    // DM sidebar/unread-badge list without N+1 queries from the client.
    struct ChannelUnread { int64_t channel_id; bool is_group; std::string name; int unread; };
    std::vector<ChannelUnread> channels_with_unread(int64_t user_id) {
        std::vector<ChannelUnread> out;
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "SELECT c.id, c.is_group, c.name FROM dm_channels c "
            "JOIN dm_members m ON m.channel_id = c.id WHERE m.user_id = ?;",
            -1, &stmt, nullptr);
        sqlite3_bind_int64(stmt, 1, user_id);
        while (sqlite3_step(stmt) == SQLITE_ROW) {
            ChannelUnread cu;
            cu.channel_id = sqlite3_column_int64(stmt, 0);
            cu.is_group = sqlite3_column_int(stmt, 1) != 0;
            cu.name = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
            cu.unread = unread_count(cu.channel_id, user_id);
            out.push_back(cu);
        }
        sqlite3_finalize(stmt);
        return out;
    }

    // ---- media ----
    void insert_media(const std::string& id, int64_t owner_id, const std::string& mime, int64_t byte_size) {
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db_,
            "INSERT INTO media(id, owner_id, mime_type, byte_size, created_at) VALUES (?, ?, ?, ?, strftime('%s','now'));",
            -1, &stmt, nullptr);
        sqlite3_bind_text(stmt, 1, id.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 2, owner_id);
        sqlite3_bind_text(stmt, 3, mime.c_str(), -1, SQLITE_TRANSIENT);
        sqlite3_bind_int64(stmt, 4, byte_size);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }

private:
    sqlite3* db_ = nullptr;
};

} // namespace pulse::db
