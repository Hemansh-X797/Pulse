import { supabase } from '../supabase';

// Replaces server/src/common/media_store.hpp entirely. That version
// base64-encoded the file into a JSON body (a deliberate workaround for
// the C++ server having no multipart parser) and wrote it to local disk.
// Supabase Storage takes the raw File directly — no base64 overhead, no
// local disk to run out of space on, and it's served from a CDN.
//
// Setup: create a public bucket named "media" in the Supabase dashboard
// (Storage → New bucket → uncheck "restrict file size" only if you want
// to raise the 5MB cap kept here to match the C++ version's limit) — see
// docs/SUPABASE_SETUP.md.

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadMedia(file: File): Promise<string> {
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error('unsupported file type — use PNG, JPEG, WEBP, or GIF');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('file too large (max 5MB)');
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('not authenticated');

  const ext = file.name.split('.').pop() || 'bin';
  const path = `${userData.user.id}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from('media').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;

  const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
  return urlData.publicUrl;
}
