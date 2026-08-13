-- Pulse schema — PostgreSQL.
-- Direct conversion from the SQLite schema this replaced: same table
-- shapes, same column names, so application-level query logic barely
-- changed. Differences from the SQLite version:
--   - SERIAL/BIGSERIAL instead of INTEGER PRIMARY KEY AUTOINCREMENT
--   - BOOLEAN instead of INTEGER 0/1 flags
--   - BIGINT epoch-seconds kept for created_at/updated_at/etc (not
--     TIMESTAMPTZ) specifically so no application code needs to change
--     how it reads/writes/compares these values
--   - tables reordered so every REFERENCES target already exists at
--     CREATE TABLE time — Postgres validates this immediately, SQLite
--     doesn't

CREATE TABLE IF NOT EXISTS users (
    id                   BIGSERIAL PRIMARY KEY,
    username             TEXT NOT NULL UNIQUE,
    password_hash        TEXT DEFAULT NULL,
    password_salt        TEXT DEFAULT NULL,
    google_id            TEXT DEFAULT NULL UNIQUE,
    discord_id           TEXT DEFAULT NULL UNIQUE,
    display_name         TEXT NOT NULL,
    bio                  TEXT NOT NULL DEFAULT '',
    pronouns             TEXT NOT NULL DEFAULT '',
    status_text          TEXT NOT NULL DEFAULT '',
    avatar_url           TEXT NOT NULL DEFAULT '',
    banner_url           TEXT NOT NULL DEFAULT '',
    accent_color_top     TEXT NOT NULL DEFAULT '#5865F2',
    accent_color_bottom  TEXT NOT NULL DEFAULT '#EB459E',
    theme_json           TEXT NOT NULL DEFAULT '{}',
    created_at           BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS servers (
    id                   BIGSERIAL PRIMARY KEY,
    name                 TEXT NOT NULL,
    icon_url             TEXT NOT NULL DEFAULT '',
    accent_color_top     TEXT NOT NULL DEFAULT '#5865F2',
    accent_color_bottom  TEXT NOT NULL DEFAULT '#EB459E',
    owner_id             BIGINT NOT NULL REFERENCES users(id),
    invite_code          TEXT NOT NULL UNIQUE,
    created_at           BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS server_members (
    server_id  BIGINT NOT NULL REFERENCES servers(id),
    user_id    BIGINT NOT NULL REFERENCES users(id),
    role       TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
    joined_at  BIGINT NOT NULL,
    PRIMARY KEY (server_id, user_id)
);

CREATE TABLE IF NOT EXISTS dm_channels (
    id         BIGSERIAL PRIMARY KEY,
    is_group   BOOLEAN NOT NULL DEFAULT FALSE,
    name       TEXT NOT NULL DEFAULT '',
    server_id  BIGINT DEFAULT NULL REFERENCES servers(id),
    topic      TEXT NOT NULL DEFAULT '',
    position   INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS dm_members (
    channel_id BIGINT NOT NULL REFERENCES dm_channels(id),
    user_id    BIGINT NOT NULL REFERENCES users(id),
    joined_at  BIGINT NOT NULL,
    PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id              BIGSERIAL PRIMARY KEY,
    channel_id      BIGINT NOT NULL REFERENCES dm_channels(id),
    sender_id       BIGINT NOT NULL REFERENCES users(id),
    body_raw        TEXT NOT NULL,
    body_rendered   TEXT NOT NULL,
    reply_to_id     BIGINT DEFAULT NULL REFERENCES messages(id),
    edited_at       BIGINT DEFAULT NULL,
    deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_reactions (
    message_id BIGINT NOT NULL REFERENCES messages(id),
    user_id    BIGINT NOT NULL REFERENCES users(id),
    emoji      TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS read_receipts (
    channel_id            BIGINT NOT NULL REFERENCES dm_channels(id),
    user_id               BIGINT NOT NULL REFERENCES users(id),
    last_read_message_id  BIGINT NOT NULL DEFAULT 0,
    updated_at            BIGINT NOT NULL,
    PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS posts (
    id            BIGSERIAL PRIMARY KEY,
    author_id     BIGINT NOT NULL REFERENCES users(id),
    body_raw      TEXT NOT NULL,
    body_rendered TEXT NOT NULL,
    media_url     TEXT NOT NULL DEFAULT '',
    created_at    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_comments (
    id            BIGSERIAL PRIMARY KEY,
    post_id       BIGINT NOT NULL REFERENCES posts(id),
    author_id     BIGINT NOT NULL REFERENCES users(id),
    body_raw      TEXT NOT NULL,
    body_rendered TEXT NOT NULL,
    created_at    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_reactions (
    post_id    BIGINT NOT NULL REFERENCES posts(id),
    user_id    BIGINT NOT NULL REFERENCES users(id),
    emoji      TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (post_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS media (
    id          TEXT PRIMARY KEY,
    owner_id    BIGINT NOT NULL REFERENCES users(id),
    mime_type   TEXT NOT NULL,
    byte_size   BIGINT NOT NULL,
    created_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users(id), -- recipient
    type           TEXT NOT NULL, -- 'message' | 'reaction' | 'comment' | 'server_invite'
    actor_id       BIGINT REFERENCES users(id),           -- who caused it
    actor_username TEXT NOT NULL DEFAULT '',
    channel_id     BIGINT DEFAULT NULL,
    post_id        BIGINT DEFAULT NULL,
    body           TEXT NOT NULL DEFAULT '',
    read           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_channels_server ON dm_channels(server_id, position);
CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at);
