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
    server_id  INTEGER DEFAULT NULL REFERENCES servers(id),
    topic      TEXT DEFAULT '',
    position   INTEGER NOT NULL DEFAULT 0,
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

-- ---------------- Servers (Discord-style multi-channel spaces) ----------------
-- A "server" is a named space owning a set of channels (rows in dm_channels
-- with server_id set). Chat itself — send/edit/delete/reply/read/typing —
-- is entirely unchanged: a server channel is just a dm_channels row, so
-- every existing chat op works on it with zero new code.
CREATE TABLE IF NOT EXISTS servers (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    name                 TEXT NOT NULL,
    icon_url             TEXT DEFAULT '',
    accent_color_top     TEXT DEFAULT '#5865F2',
    accent_color_bottom  TEXT DEFAULT '#EB459E',
    owner_id             INTEGER NOT NULL REFERENCES users(id),
    invite_code          TEXT NOT NULL UNIQUE,
    created_at           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS server_members (
    server_id  INTEGER NOT NULL REFERENCES servers(id),
    user_id    INTEGER NOT NULL REFERENCES users(id),
    role       TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
    joined_at  INTEGER NOT NULL,
    PRIMARY KEY (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channels_server ON dm_channels(server_id, position);
CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);

-- ---------------- Notifications ----------------
CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id), -- recipient
    type        TEXT NOT NULL, -- 'message' | 'reaction' | 'comment' | 'server_invite'
    actor_id    INTEGER REFERENCES users(id),           -- who caused it
    actor_username TEXT DEFAULT '',
    channel_id  INTEGER DEFAULT NULL,
    post_id     INTEGER DEFAULT NULL,
    body        TEXT DEFAULT '',
    read        INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at);
