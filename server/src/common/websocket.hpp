#pragma once
// Minimal RFC 6455 WebSocket support: handshake + text-frame encode/decode.
// No compression, no fragmentation of outgoing frames (fine for our JSON
// message sizes), but DOES handle fragmented/masked incoming frames since
// all browser->server frames are masked per spec.
#include <cstdint>
#include <cstring>
#include <optional>
#include <sstream>
#include <string>
#include <vector>
#include "sha1.h"

namespace ws {

constexpr const char* kMagicGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

inline std::optional<std::string> extract_header(const std::string& request, const std::string& name) {
    std::string lower_req = request;
    std::string search = name + ":";
    size_t pos = request.find(search);
    if (pos == std::string::npos) {
        // case-insensitive fallback scan
        std::string lower_name = name;
        for (auto& c : lower_name) c = tolower(c);
        std::string lower = request;
        for (auto& c : lower) c = tolower(c);
        pos = lower.find(lower_name + ":");
        if (pos == std::string::npos) return std::nullopt;
    }
    size_t start = request.find(':', pos) + 1;
    size_t end = request.find("\r\n", start);
    std::string val = request.substr(start, end - start);
    while (!val.empty() && val.front() == ' ') val.erase(val.begin());
    while (!val.empty() && val.back() == ' ') val.pop_back();
    return val;
}

// Returns the HTTP response to send back to complete the handshake, or
// nullopt if this isn't a valid WebSocket upgrade request.
inline std::optional<std::string> build_handshake_response(const std::string& request) {
    auto key = extract_header(request, "Sec-WebSocket-Key");
    if (!key) return std::nullopt;
    std::string accept_src = *key + kMagicGuid;
    auto digest = sha1::hash(reinterpret_cast<const uint8_t*>(accept_src.data()), accept_src.size());
    std::string accept = sha1::base64_encode(digest.data(), digest.size());

    std::ostringstream oss;
    oss << "HTTP/1.1 101 Switching Protocols\r\n"
        << "Upgrade: websocket\r\n"
        << "Connection: Upgrade\r\n"
        << "Sec-WebSocket-Accept: " << accept << "\r\n\r\n";
    return oss.str();
}

// Encode a text frame (server->client frames are never masked).
inline std::vector<uint8_t> encode_text_frame(const std::string& payload) {
    std::vector<uint8_t> out;
    out.push_back(0x81); // FIN=1, opcode=1 (text)
    size_t len = payload.size();
    if (len <= 125) {
        out.push_back(static_cast<uint8_t>(len));
    } else if (len <= 65535) {
        out.push_back(126);
        out.push_back(static_cast<uint8_t>((len >> 8) & 0xff));
        out.push_back(static_cast<uint8_t>(len & 0xff));
    } else {
        out.push_back(127);
        for (int i = 7; i >= 0; --i) out.push_back(static_cast<uint8_t>((len >> (i*8)) & 0xff));
    }
    out.insert(out.end(), payload.begin(), payload.end());
    return out;
}

inline std::vector<uint8_t> encode_close_frame() {
    return {0x88, 0x00};
}

struct DecodedFrame {
    uint8_t opcode;
    std::string payload;
    bool ok = false;
    size_t bytes_consumed = 0;
};

// Attempts to decode one frame from the front of `buf`. If there isn't a
// full frame yet, returns ok=false with bytes_consumed=0 (caller should
// wait for more data).
inline DecodedFrame decode_frame(const std::vector<uint8_t>& buf) {
    DecodedFrame f;
    if (buf.size() < 2) return f;
    uint8_t byte0 = buf[0];
    uint8_t byte1 = buf[1];
    f.opcode = byte0 & 0x0F;
    bool masked = (byte1 & 0x80) != 0;
    uint64_t len = byte1 & 0x7F;
    size_t pos = 2;

    if (len == 126) {
        if (buf.size() < 4) return f;
        len = (static_cast<uint64_t>(buf[2]) << 8) | buf[3];
        pos = 4;
    } else if (len == 127) {
        if (buf.size() < 10) return f;
        len = 0;
        for (int i = 0; i < 8; ++i) len = (len << 8) | buf[2+i];
        pos = 10;
    }

    uint8_t mask_key[4] = {0,0,0,0};
    if (masked) {
        if (buf.size() < pos + 4) return f;
        for (int i = 0; i < 4; ++i) mask_key[i] = buf[pos+i];
        pos += 4;
    }

    if (buf.size() < pos + len) return f;

    f.payload.resize(len);
    for (uint64_t i = 0; i < len; ++i) {
        uint8_t byte = buf[pos + i];
        if (masked) byte ^= mask_key[i % 4];
        f.payload[i] = static_cast<char>(byte);
    }
    f.ok = true;
    f.bytes_consumed = pos + len;
    return f;
}

} // namespace ws
