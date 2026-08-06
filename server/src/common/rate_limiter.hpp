#pragma once
// Sliding-window rate limiter for auth endpoints. In-memory is fine for a
// single-instance deploy; Phase 4 (horizontal scaling) swaps this for
// Redis the same way SessionStore does, without changing the call site.
#include <algorithm>
#include <chrono>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace pulse::security {

class RateLimiter {
public:
    RateLimiter(int max_attempts, int window_seconds)
        : max_attempts_(max_attempts), window_seconds_(window_seconds) {}

    // Returns true if this key is still within its allowance.
    bool allow(const std::string& key) {
        auto now = std::chrono::steady_clock::now();
        std::lock_guard<std::mutex> lock(mu_);
        auto& hits = hits_[key];
        // drop anything older than the window
        hits.erase(std::remove_if(hits.begin(), hits.end(), [&](auto t) {
            return std::chrono::duration_cast<std::chrono::seconds>(now - t).count() > window_seconds_;
        }), hits.end());
        if (static_cast<int>(hits.size()) >= max_attempts_) return false;
        hits.push_back(now);
        return true;
    }

private:
    int max_attempts_;
    int window_seconds_;
    std::mutex mu_;
    std::unordered_map<std::string, std::vector<std::chrono::steady_clock::time_point>> hits_;
};

} // namespace pulse::security
