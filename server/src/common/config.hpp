#pragma once
// OAuth credentials come from environment variables, never hardcoded or
// committed. Each provider needs its own registered app — see
// docs/OAUTH_SETUP.md for exactly how to create one and what to set here.
#include <cstdlib>
#include <string>

namespace pulse::config {

inline std::string env(const char* name, const std::string& fallback = "") {
    const char* v = std::getenv(name);
    return v ? std::string(v) : fallback;
}

struct OAuthConfig {
    std::string google_client_id     = env("PULSE_GOOGLE_CLIENT_ID");
    std::string google_client_secret = env("PULSE_GOOGLE_CLIENT_SECRET");
    std::string google_redirect_uri  = env("PULSE_GOOGLE_REDIRECT_URI", "http://localhost:8080/auth/google/callback");

    std::string discord_client_id     = env("PULSE_DISCORD_CLIENT_ID");
    std::string discord_client_secret = env("PULSE_DISCORD_CLIENT_SECRET");
    std::string discord_redirect_uri  = env("PULSE_DISCORD_REDIRECT_URI", "http://localhost:8080/auth/discord/callback");

    // Where to send the browser back to after a successful OAuth login —
    // the web client's own URL, since the callback lands on the API server.
    std::string frontend_url = env("PULSE_FRONTEND_URL", "http://localhost:8000");

    bool google_configured() const { return !google_client_id.empty() && !google_client_secret.empty(); }
    bool discord_configured() const { return !discord_client_id.empty() && !discord_client_secret.empty(); }
};

} // namespace pulse::config
