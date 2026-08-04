#pragma once
// Shortcode -> Unicode emoji map. Discord/Slack-style :name: syntax.
// This is a hand-picked common subset; extend freely, it's just data.
#include <unordered_map>
#include <string>

namespace pulse::emoji {

inline const std::unordered_map<std::string, std::string>& shortcode_map() {
    static const std::unordered_map<std::string, std::string> kMap = {
        {"fire", "\U0001F525"},
        {"heart", "\u2764\uFE0F"},
        {"joy", "\U0001F602"},
        {"laughing", "\U0001F606"},
        {"smile", "\U0001F604"},
        {"cry", "\U0001F622"},
        {"sob", "\U0001F62D"},
        {"thumbsup", "\U0001F44D"},
        {"+1", "\U0001F44D"},
        {"thumbsdown", "\U0001F44E"},
        {"-1", "\U0001F44E"},
        {"clap", "\U0001F44F"},
        {"eyes", "\U0001F440"},
        {"skull", "\U0001F480"},
        {"100", "\U0001F4AF"},
        {"tada", "\U0001F389"},
        {"rocket", "\U0001F680"},
        {"star", "\u2B50"},
        {"star2", "\U0001F31F"},
        {"sparkles", "\u2728"},
        {"thinking", "\U0001F914"},
        {"wave", "\U0001F44B"},
        {"pray", "\U0001F64F"},
        {"ok_hand", "\U0001F44C"},
        {"muscle", "\U0001F4AA"},
        {"heart_eyes", "\U0001F60D"},
        {"sunglasses", "\U0001F60E"},
        {"sob_face", "\U0001F62D"},
        {"angry", "\U0001F620"},
        {"scream", "\U0001F631"},
        {"peace", "\u270C\uFE0F"},
        {"pizza", "\U0001F355"},
        {"coffee", "\u2615"},
        {"beers", "\U0001F37B"},
        {"moneybag", "\U0001F4B0"},
        {"gem", "\U0001F48E"},
        {"trophy", "\U0001F3C6"},
        {"warning", "\u26A0\uFE0F"},
        {"x", "\u274C"},
        {"check", "\u2705"},
        {"heavy_check_mark", "\u2714\uFE0F"},
        {"question", "\u2753"},
        {"exclamation", "\u2757"},
        {"zzz", "\U0001F4A4"},
        {"100fire", "\U0001F525"},
        {"raised_hands", "\U0001F64C"},
        {"handshake", "\U0001F91D"},
        {"broken_heart", "\U0001F494"},
        {"purple_heart", "\U0001F49C"},
        {"blue_heart", "\U0001F499"},
        {"green_heart", "\U0001F49A"},
        {"yellow_heart", "\U0001F49B"},
        {"black_heart", "\U0001F5A4"},
        {"rofl", "\U0001F923"},
        {"skull_and_crossbones", "\u2620\uFE0F"},
        {"ghost", "\U0001F47B"},
        {"alien", "\U0001F47D"},
        {"robot", "\U0001F916"},
        {"unicorn", "\U0001F984"},
        {"rainbow", "\U0001F308"},
        {"sun", "\u2600\uFE0F"},
        {"moon", "\U0001F319"},
        {"cloud", "\u2601\uFE0F"},
        {"snowflake", "\u2744\uFE0F"},
    };
    return kMap;
}

} // namespace pulse::emoji
