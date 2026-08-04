// Minimal SHA-1 (needed only for the WebSocket handshake's
// Sec-WebSocket-Accept per RFC 6455 — not used for anything security
// sensitive like passwords, which use sha256::pbkdf2 instead) + base64.
#pragma once
#include <cstdint>
#include <cstring>
#include <string>
#include <array>
#include <vector>

namespace sha1 {

inline uint32_t rol(uint32_t v, int n) { return (v << n) | (v >> (32 - n)); }

inline std::array<uint8_t, 20> hash(const uint8_t* data, size_t len) {
    uint32_t h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;

    std::vector<uint8_t> msg(data, data + len);
    uint64_t ml = static_cast<uint64_t>(len) * 8;
    msg.push_back(0x80);
    while (msg.size() % 64 != 56) msg.push_back(0);
    for (int i = 7; i >= 0; --i) msg.push_back(static_cast<uint8_t>(ml >> (i * 8)));

    for (size_t chunk = 0; chunk < msg.size(); chunk += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; ++i) {
            w[i] = (msg[chunk+i*4] << 24) | (msg[chunk+i*4+1] << 16) |
                   (msg[chunk+i*4+2] << 8) | msg[chunk+i*4+3];
        }
        for (int i = 16; i < 80; ++i) w[i] = rol(w[i-3]^w[i-8]^w[i-14]^w[i-16], 1);

        uint32_t a=h0,b=h1,c=h2,d=h3,e=h4;
        for (int i = 0; i < 80; ++i) {
            uint32_t f, k;
            if (i < 20) { f = (b & c) | ((~b) & d); k = 0x5A827999; }
            else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
            else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
            else { f = b ^ c ^ d; k = 0xCA62C1D6; }
            uint32_t temp = rol(a,5) + f + e + k + w[i];
            e=d; d=c; c=rol(b,30); b=a; a=temp;
        }
        h0+=a; h1+=b; h2+=c; h3+=d; h4+=e;
    }

    std::array<uint8_t, 20> out;
    uint32_t hs[5] = {h0,h1,h2,h3,h4};
    for (int i = 0; i < 5; ++i)
        for (int j = 0; j < 4; ++j)
            out[i*4+j] = static_cast<uint8_t>(hs[i] >> (24 - j*8));
    return out;
}

inline std::string base64_encode(const uint8_t* data, size_t len) {
    static const char* tbl = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    size_t i = 0;
    while (i + 3 <= len) {
        uint32_t n = (data[i] << 16) | (data[i+1] << 8) | data[i+2];
        out += tbl[(n >> 18) & 0x3F]; out += tbl[(n >> 12) & 0x3F];
        out += tbl[(n >> 6) & 0x3F]; out += tbl[n & 0x3F];
        i += 3;
    }
    size_t rem = len - i;
    if (rem == 1) {
        uint32_t n = data[i] << 16;
        out += tbl[(n >> 18) & 0x3F]; out += tbl[(n >> 12) & 0x3F]; out += "==";
    } else if (rem == 2) {
        uint32_t n = (data[i] << 16) | (data[i+1] << 8);
        out += tbl[(n >> 18) & 0x3F]; out += tbl[(n >> 12) & 0x3F]; out += tbl[(n >> 6) & 0x3F]; out += "=";
    }
    return out;
}

} // namespace sha1
