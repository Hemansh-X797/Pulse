// Scheduled function — runs on a cron trigger, not a webhook. Recomputes
// each post's feed_scores row (see the Postgres-era schema in
// ARCHITECTURE.md section 2) using signals that are too expensive to
// compute on every single GET /feed request: follower-graph distance,
// time-decayed engagement velocity, author affinity, etc.
//
// Why this lives here and not in the C++ server: it's periodic batch
// work (every few minutes), not request-driven, and doesn't need to share
// a process with the low-latency chat/API server. Running it as a
// scheduled serverless function means it scales with the size of the
// posts table, not with request traffic, and a slow run never blocks a
// real user's request the way an in-process cron thread in the C++
// server could.
//
// Deploy target: Vercel Cron (add to vercel.json — see the config block
// below), AWS EventBridge + Lambda, or a Cloudflare Worker Cron Trigger.
// Needs direct Postgres access (Phase 4 — see ARCHITECTURE.md), not the
// C++ server's HTTP API, since it's touching the whole posts table at
// once and paying per-request JSON overhead for that would be wasteful.
const { Client } = require('pg');

module.exports = async function handler(req, res) {
  // Scheduled functions should still check a secret if the platform
  // exposes the endpoint publicly (Vercel Cron does, gated by this header).
  if (req.headers['authorization'] !== `Bearer ${process.env.PULSE_CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const client = new Client({ connectionString: process.env.PULSE_DATABASE_URL });
  await client.connect();

  try {
    // Recency-decayed engagement score, same shape as the SQLite version
    // in server/src/common/db.hpp's feed() query, but computed in bulk
    // here instead of per-request — the two should stay in sync
    // conceptually even though one lives in C++ and one in JS.
    await client.query(`
      INSERT INTO feed_scores (post_id, user_id, score, computed_at)
      SELECT
        p.id,
        NULL, -- global score for now; per-user personalization is a later pass
        (EXTRACT(EPOCH FROM p.created_at) +
          (COALESCE(r.reaction_count, 0) + COALESCE(c.comment_count, 0) * 2) * 3600
        ) AS score,
        NOW()
      FROM posts p
      LEFT JOIN (SELECT post_id, COUNT(*) reaction_count FROM post_reactions GROUP BY post_id) r ON r.post_id = p.id
      LEFT JOIN (SELECT post_id, COUNT(*) comment_count FROM post_comments GROUP BY post_id) c ON c.post_id = p.id
      WHERE p.created_at > NOW() - INTERVAL '14 days'
      ON CONFLICT (post_id, user_id) DO UPDATE SET score = EXCLUDED.score, computed_at = EXCLUDED.computed_at;
    `);

    return res.status(200).json({ ok: true, ran_at: new Date().toISOString() });
  } finally {
    await client.end();
  }
};

// ---- vercel.json cron config (add to the project root, not this file) ----
// {
//   "crons": [
//     { "path": "/api/feed-rescore", "schedule": "*/10 * * * *" }
//   ]
// }
