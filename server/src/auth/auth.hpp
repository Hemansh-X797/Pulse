#pragma once
#include <cctype>
#include <string>
#include <random>
#include <sstream>
#include <iomanip>
#include <unordered_map>
#include <mutex>
#include "../common/db.hpp"
#include "sha256.h"

namespace pulse::auth {

constexpr uint32_t kPbkdf2Iterations = 100000;

inline std::string random_hex(size_t nbytes) {
    static thread_local std::mt19937_64 rng(std::random_device{}());
    std::ostringstream oss;
    for (size_t i = 0; i < nbytes; ++i) {
        oss << std::hex << std::setw(2) << std::setfill('0') << (rng() & 0xff);
    }
    return oss.str();
}

inline std::string hash_password(const std::string& password, const std::string& salt) {
    auto h = sha256::pbkdf2(password, salt, kPbkdf2Iterations);
    return sha256::to_hex(h);
}

// In-memory session store: token -> user_id. Phase 3 swaps this for Redis
// so it works across multiple Gateway instances; interface stays the same.
class SessionStore {
public:
    std::string create_session(int64_t user_id) {
        std::string token = random_hex(32);
        std::lock_guard<std::mutex> lock(mu_);
        sessions_[token] = user_id;
        return token;
    }
    std::optional<int64_t> resolve(const std::string& token) {
        std::lock_guard<std::mutex> lock(mu_);
        auto it = sessions_.find(token);
        if (it == sessions_.end()) return std::nullopt;
        return it->second;
    }
    void revoke(const std::string& token) {
        std::lock_guard<std::mutex> lock(mu_);
        sessions_.erase(token);
    }
private:
    std::mutex mu_;
    std::unordered_map<std::string, int64_t> sessions_;
};

struct SignupResult { bool ok; std::string error; int64_t user_id = 0; };
struct LoginResult { bool ok; std::string error; int64_t user_id = 0; std::string token; };

inline bool is_valid_username_char(char c) {
    return std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '.';
}

inline SignupResult signup(db::Database& db, const std::string& username, const std::string& display_name, const std::string& password) {
    if (username.size() < 3 || username.size() > 32) return {false, "username must be 3-32 chars"};
    for (char c : username) {
        if (!is_valid_username_char(c)) return {false, "username can only contain letters, numbers, '_' and '.'"};
    }
    if (password.size() < 8) return {false, "password must be at least 8 chars"};
    std::string salt = random_hex(16);
    std::string hash = hash_password(password, salt);
    auto id = db.create_user(username, display_name.empty() ? username : display_name, hash, salt);
    if (!id) return {false, "username already taken"};
    return {true, "", *id};
}

inline LoginResult login(db::Database& db, SessionStore& sessions, const std::string& username, const std::string& password) {
    auto row = db.find_user_for_login(username);
    if (!row) return {false, "invalid username or password"};
    std::string hash = hash_password(password, row->password_salt);
    if (hash != row->password_hash) return {false, "invalid username or password"};
    std::string token = sessions.create_session(row->id);
    return {true, "", row->id, token};
}

} // namespace pulse::auth
