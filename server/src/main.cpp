#include <thread>
#include <iostream>

#include "common/db.hpp"
#include "common/schema_sql.hpp"
#include "common/config.hpp"
#include "auth/auth.hpp"
#include "chat/chat_server.hpp"
#include "gateway/api_server.hpp"

int main(int argc, char** argv) {
    // Standard postgres:// connection string — exactly what Render,
    // Railway, Supabase, and Heroku all hand you for a managed Postgres
    // instance. Falls back to a local dev default so this still runs
    // out of the box against `service postgresql start` locally.
    std::string db_url = argc > 1 ? argv[1]
        : pulse::config::env("PULSE_DATABASE_URL",
              "postgresql://postgres:devpassword@localhost:5432/pulse");

    pulse::db::Database db(db_url);
    db.run_schema(pulse::db::kSchemaSql);

    pulse::auth::SessionStore sessions;

    pulse::gateway::ApiServer http_server(db, sessions, 8080);
    pulse::chat::ChatServer chat_server(db, sessions, 8081);

    std::thread http_thread([&] { http_server.run(); });
    std::thread chat_thread([&] { chat_server.run(); });

    std::cout << "Pulse server up (Postgres). HTTP auth on :8080, chat on :8081\n";

    http_thread.join();
    chat_thread.join();
    return 0;
}
