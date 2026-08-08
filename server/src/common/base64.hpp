#pragma once
#include <string>
#include <vector>
#include <cstdint>
#include <stdexcept>

namespace pulse::b64 {

inline std::vector<uint8_t> decode(const std::string& in) {
    static int8_t table[256];
    static bool init = false;
    if (!init) {
        for (int i = 0; i < 256; ++i) table[i] = -1;
        const char* chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        for (int i = 0; i < 64; ++i) table[static_cast<unsigned char>(chars[i])] = static_cast<int8_t>(i);
        init = true;
    }

    std::vector<uint8_t> out;
    int val = 0, bits = -8;
    for (unsigned char c : in) {
        if (c == '=' || c == '\n' || c == '\r') continue;
        int8_t d = table[c];
        if (d == -1) continue; // skip anything unexpected rather than throwing
        val = (val << 6) + d;
        bits += 6;
        if (bits >= 0) {
            out.push_back(static_cast<uint8_t>((val >> bits) & 0xFF));
            bits -= 8;
        }
    }
    return out;
}

} // namespace pulse::b64
