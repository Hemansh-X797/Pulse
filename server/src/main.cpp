#include <fstream>
#include <sstream>
#include <thread>
#include <iostream>

#include "common/db.hpp"
#include "auth/auth.hpp"
#include "chat/chat_server.hpp"
#include "gateway/api_server.hpp"

static std::string read_file(const std::string& path) {
    std::ifstream f(path);
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

int main(int argc, char** argv) {
    std::string db_path = argc > 1 ? argv[1] : "pulse.db";
    std::string schema_path = "db/schema.sql";

    pulse::db::Database db(db_path);
    db.run_schema(read_file(schema_path));

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
