// POST /api/push-notify
// Called by the C++ server (via https_client.hpp) whenever it creates a
// notification for a user who has push enabled — see
// server/src/gateway/api_server.hpp's notify_post_engagement() and the
// chat server's push_to_user(), which are the two places new
// notifications get created. This function's job is just fan-out: take
// one notification, deliver it to every device the user has subscribed
// from, using the Web Push protocol (works for Chrome/Firefox/Edge, and
// Safari 16.4+).
//
// Why this lives here and not in the C++ server: sending a push
// notification means an outbound call per subscribed device, sometimes
// several per user, and it doesn't need to block the chat/API response —
// classic fire-and-forget fan-out, which is what serverless platforms are
// built for. Keeping it out of the C++ server also means a spike in
// notification volume can't slow down live chat.
//
// Deploy target: Vercel Functions (drop this file in api/push-notify.js),
// AWS Lambda behind API Gateway, or Cloudflare Workers with minor syntax
// tweaks (fetch-based Workers don't use `module.exports`/`req,res` — see
// the note at the bottom of this file).
const webpush = require('web-push');
const { verifySignature } = require('../shared/verify-webhook');

webpush.setVapidDetails(
  process.env.PULSE_PUSH_CONTACT || 'mailto:you@example.com',
  process.env.PULSE_VAPID_PUBLIC_KEY,
  process.env.PULSE_VAPID_PRIVATE_KEY
);

// In production, swap this for a real lookup (Postgres/Redis) keyed by
// user_id — this in-memory stub only exists so the function is runnable
// standalone for testing. Subscriptions are added via a separate
// POST /api/push-subscribe endpoint (not included — same shape as this
// file, just stores { user_id, subscription } instead of sending).
const subscriptionsByUser = new Map();

module.exports = async function handler(req, res) {
  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['x-pulse-signature'];
  if (!verifySignature(rawBody, signature, process.env.PULSE_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  const { user_id, title, body, url } = req.body;
  const subs = subscriptionsByUser.get(user_id) || [];
  if (subs.length === 0) return res.status(200).json({ delivered: 0 });

  const payload = JSON.stringify({ title, body, url: url || '/' });
  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(sub, payload))
  );

  const delivered = results.filter(r => r.status === 'fulfilled').length;
  return res.status(200).json({ delivered, total: subs.length });
};

// ---- Cloudflare Workers variant ----
// Workers use a fetch-event handler instead of (req, res). If deploying
// there instead of Vercel/Lambda, wrap the same logic like:
//
//   export default {
//     async fetch(request, env) {
//       const body = await request.json();
//       // ...same signature check and webpush.sendNotification calls,
//       // using env.PULSE_WEBHOOK_SECRET etc. instead of process.env
//       return new Response(JSON.stringify({ delivered }), { status: 200 });
//     }
//   }
