#pragma once
// Single-pass shortcode -> emoji expander used by Chat, Feed (posts +
// comments) so :fire: etc. render identically everywhere. O(n) over input.
#include <string>
#include <string_view>
#include <cctype>
#include "emoji_map.hpp"

namespace pulse::emoji {

inline bool is_shortcode_char(char c) {
    return std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '+' || c == '-';
}

// Expands every `:token:` span whose token is a known shortcode into the
// corresponding unicode emoji. Unknown tokens are left as literal text
// (so ":notarealthing:" stays ":notarealthing:" rather than vanishing).
inline std::string render(std::string_view input) {
    const auto& map = shortcode_map();
    std::string out;
    out.reserve(input.size());

    size_t i = 0;
    const size_t n = input.size();
    while (i < n) {
        if (input[i] == ':') {
            size_t j = i + 1;
            while (j < n && is_shortcode_char(input[j])) ++j;
            if (j < n && input[j] == ':' && j > i + 1) {
                std::string token(input.substr(i + 1, j - i - 1));
                auto it = map.find(token);
                if (it != map.end()) {
                    out += it->second;
                    i = j + 1;
                    continue;
                }
            }
        }
        out += input[i];
        ++i;
    }
    return out;
}

} // namespace pulse::emoji
