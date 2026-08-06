#include <thread>
#include <iostream>

#include "common/db.hpp"
#include "common/schema_sql.hpp"
#include "auth/auth.hpp"
#include "chat/chat_server.hpp"
#include "gateway/api_server.hpp"

int main(int argc, char** argv) {
    std::string db_path = argc > 1 ? argv[1] : "pulse.db";

    pulse::db::Database db(db_path);
    db.run_schema(pulse::db::kSchemaSql);

    pulse::auth::SessionStore sessions;

    pulse::gateway::ApiServer http_server(db, sessions, 8080);
    pulse::chat::ChatServer chat_server(db, sessions, 8081);

    std::thread http_thread([&] { http_server.run(); });
    std::thread chat_thread([&] { chat_server.run(); });

    std::cout << "Pulse server up. HTTP auth on :8080, chat on :8081\n";

    http_thread.join();
    chat_thread.join();
    return 0;
}
