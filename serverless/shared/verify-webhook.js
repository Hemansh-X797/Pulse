// Shared by every function in this folder: verifies that an incoming
// request actually came from the Pulse C++ server, not from a random
// caller who found the URL. The C++ server signs each webhook call with
// HMAC-SHA256 over the raw body, using a secret only it and these
// functions know (PULSE_WEBHOOK_SECRET, set as an env var on both sides).
//
// This is deliberately simple — no JWT library, no OAuth dance, just a
// signed-body check, because these are server-to-server calls, not
// user-facing auth.
const crypto = require('crypto');

function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // timing-safe compare
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { verifySignature };
