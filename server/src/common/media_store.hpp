#pragma once
#include <filesystem>
#include <fstream>
#include <random>
#include <sstream>
#include <string>
#include <unordered_set>
#include <vector>

#include "db.hpp"

namespace pulse::media {

namespace fs = std::filesystem;

constexpr size_t kMaxBytes = 5 * 1024 * 1024; // 5MB per upload — plenty for avatars/post images

inline const std::unordered_set<std::string>& allowed_mimes() {
    static const std::unordered_set<std::string> kSet = {"image/png", "image/jpeg", "image/webp", "image/gif"};
    return kSet;
}

inline std::string extension_for(const std::string& mime) {
    if (mime == "image/png") return ".png";
    if (mime == "image/jpeg") return ".jpg";
    if (mime == "image/webp") return ".webp";
    if (mime == "image/gif") return ".gif";
    return ".bin";
}

class MediaStore {
public:
    explicit MediaStore(const std::string& dir) : dir_(dir) {
        fs::create_directories(dir_);
    }

    struct SaveResult { bool ok; std::string error; std::string id; std::string url; };

    SaveResult save(db::Database& db, int64_t owner_id, const std::vector<uint8_t>& bytes, const std::string& mime) {
        if (bytes.empty()) return {false, "empty file", "", ""};
        if (bytes.size() > kMaxBytes) return {false, "file too large (max 5MB)", "", ""};
        if (!allowed_mimes().count(mime)) return {false, "unsupported file type — use PNG, JPEG, WEBP, or GIF", "", ""};

        std::string id = random_id();
        std::string filename = id + extension_for(mime);
        fs::path filepath = fs::path(dir_) / filename;

        std::ofstream out(filepath, std::ios::binary);
        if (!out) return {false, "failed to write file to disk", "", ""};
        out.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
        out.close();

        db.insert_media(id, owner_id, mime, static_cast<int64_t>(bytes.size()));
        return {true, "", id, "/media/" + filename};
    }

    // Resolves a served path like "/media/abc123.png" back to its file on
    // disk, refusing anything that isn't a plain filename (no traversal).
    std::optional<fs::path> resolve(const std::string& filename) {
        if (filename.find("..") != std::string::npos || filename.find('/') != std::string::npos) return std::nullopt;
        fs::path p = fs::path(dir_) / filename;
        if (!fs::exists(p)) return std::nullopt;
        return p;
    }

private:
    std::string dir_;

    std::string random_id() {
        static thread_local std::mt19937_64 rng(std::random_device{}());
        std::ostringstream oss;
        for (int i = 0; i < 12; ++i) oss << std::hex << (rng() & 0xf);
        return oss.str();
    }
};

} // namespace pulse::media
