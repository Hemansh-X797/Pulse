import { supabase } from '../supabase';

// Replaces server/src/common/media_store.hpp entirely. That version
// base64-encoded the file into a JSON body (a deliberate workaround for
// the C++ server having no multipart parser) and wrote it to local disk.
// Supabase Storage takes the raw File directly — no base64 overhead, no
// local disk to run out of space on, and it's served from a CDN.
//
// Setup: the bucket + its RLS policies are codified in
// supabase/migrations/003_storage_and_engagement_fixes.sql — run that
// (as the project owner, in the SQL editor) rather than clicking through
// the dashboard by hand. That migration also sets the bucket's own
// server-side file_size_limit to 10MB, matching MAX_BYTES below; if you
// change one, change the other, or uploads between the two limits will
// fail with a confusing storage-side error instead of this client-side
// one.

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit — see migration 003

export class MediaUploadError extends Error {}

/**
 * Some OS file pickers / drag-and-drop sources hand back an empty
 * `file.type` even for perfectly valid images (most common on older
 * Android WebViews and some Windows file dialogs) — that alone used to
 * make uploadMedia() reject every one of those files with "unsupported
 * file type" even though the file was fine. This resolves a missing
 * type from the file extension before the allowlist check runs, instead
 * of trusting the browser to have populated it correctly.
 */
function resolveMimeType(file: File): string | null {
  if (ALLOWED_MIME.has(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const fallback = ext ? EXT_TO_MIME[ext] : undefined;
  return fallback ?? null;
}

export async function uploadMedia(file: File, knownUserId?: string): Promise<string> {
  const mimeType = resolveMimeType(file);
  if (!mimeType) {
    throw new MediaUploadError('Unsupported file type — use PNG, JPEG, WEBP, or GIF.');
  }
  if (file.size > MAX_BYTES) {
    throw new MediaUploadError(`File too large — max ${Math.floor(MAX_BYTES / 1024 / 1024)}MB.`);
  }

  // Bug fix ("you must be signed in to upload media" on /stories):
  // supabase.auth.getUser() doesn't just read the locally-cached
  // session — it makes its own network round-trip to Supabase's auth
  // server to revalidate the JWT. That's a second, independent source
  // of "am I logged in" from the one the app already trusted to render
  // this page at all (useAuthSync's getSession(), gating the whole
  // (app) layout — see app/(app)/layout.tsx). If that revalidation
  // request is slow, rate-limited, or races anything else on first
  // paint, getUser() can transiently report no user even though the
  // store already has a valid session. Callers that already know who's
  // signed in (from useAppStore's session/profile, populated before
  // this component could even mount) should pass that id directly and
  // skip the redundant network call entirely. Falls back to getUser()
  // for callers that don't have it handy yet.
  let userId = knownUserId;
  if (!userId) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new MediaUploadError('You need to be signed in to upload media.');
    }
    userId = userData.user.id;
  }

  const ext = file.name.split('.').pop() || mimeType.split('/')[1] || 'bin';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from('media').upload(path, file, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    // Storage errors from Supabase are often terse ("new row violates
    // row-level security policy") — surface that context plainly rather
    // than letting a generic "failed to fetch" reach the UI, since a
    // missing/misconfigured bucket policy is the single most likely
    // real-world cause of this failing.
    throw new MediaUploadError(
      `Upload failed: ${error.message}. If this keeps happening, confirm the "media" storage bucket and its ` +
        'policies are set up (see supabase/migrations/003_storage_and_engagement_fixes.sql).'
    );
  }

  const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
  return urlData.publicUrl;
}
