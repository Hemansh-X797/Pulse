-- Phase 1 schema (SQLite). Migrates to Postgres in Phase 2 with the same
-- shape, so application code barely changes.

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT DEFAULT NULL,
    password_salt TEXT DEFAULT NULL,
    google_id     TEXT DEFAULT NULL UNIQUE,
    discord_id    TEXT DEFAULT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    bio           TEXT DEFAULT '',
    pronouns      TEXT DEFAULT '',
    status_text   TEXT DEFAULT '',
    avatar_url    TEXT DEFAULT '',
    banner_url    TEXT DEFAULT '',
    accent_color_top    TEXT DEFAULT '#5865F2',
    accent_color_bottom TEXT DEFAULT '#EB459E',
    theme_json    TEXT DEFAULT '{}',
    created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id     INTEGER NOT NULL REFERENCES users(id),
    body_raw      TEXT NOT NULL,
    body_rendered TEXT NOT NULL,
    media_url     TEXT DEFAULT '',
    created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS post_comments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id       INTEGER NOT NULL REFERENCES posts(id),
    author_id     INTEGER NOT NULL REFERENCES users(id),
    body_raw      TEXT NOT NULL,
    body_rendered TEXT NOT NULL,
    created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS post_reactions (
    post_id    INTEGER NOT NULL REFERENCES posts(id),
    user_id    INTEGER NOT NULL REFERENCES users(id),
    emoji      TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (post_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS media (
    id          TEXT PRIMARY KEY,
    owner_id    INTEGER NOT NULL REFERENCES users(id),
    mime_type   TEXT NOT NULL,
    byte_size   INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_channels (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    is_group   INTEGER NOT NULL DEFAULT 0,
    name       TEXT DEFAULT '',
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_members (
    channel_id INTEGER NOT NULL REFERENCES dm_channels(id),
    user_id    INTEGER NOT NULL REFERENCES users(id),
    joined_at  INTEGER NOT NULL,
    PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id      INTEGER NOT NULL REFERENCES dm_channels(id),
    sender_id       INTEGER NOT NULL REFERENCES users(id),
    body_raw        TEXT NOT NULL,
    body_rendered   TEXT NOT NULL,
    reply_to_id     INTEGER DEFAULT NULL REFERENCES messages(id),
    edited_at       INTEGER DEFAULT NULL,
    deleted         INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id),
    user_id    INTEGER NOT NULL REFERENCES users(id),
    emoji      TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS read_receipts (
    channel_id            INTEGER NOT NULL REFERENCES dm_channels(id),
    user_id               INTEGER NOT NULL REFERENCES users(id),
    last_read_message_id  INTEGER NOT NULL DEFAULT 0,
    updated_at            INTEGER NOT NULL,
    PRIMARY KEY (channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
