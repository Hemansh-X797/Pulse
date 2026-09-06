// supabase/functions/send-push/index.ts
//
// Called by the on_notification_created_push trigger
// (037_push_notifications.sql) every time a row lands in
// `notifications`. Looks up every device the target user has
// registered (push_subscriptions), sends each one a real Web Push
// message via VAPID, and prunes any subscription the browser reports
// as dead (410 Gone — the classic "uninstalled/unsubscribed" response).
//
// Deploy with: supabase functions deploy send-push
// Then set the two secrets it needs:
//   supabase secrets set VAPID_PUBLIC_KEY=<your public key>
//   supabase secrets set VAPID_PRIVATE_KEY=<your private key>
//   supabase secrets set VAPID_SUBJECT=mailto:you@example.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already available to
// every edge function automatically — no need to set those yourself.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@palspace.app';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const supabase = createClient(supabaseUrl, serviceRoleKey);

const TYPE_TITLE: Record<string, (actor: string) => string> = {
  message: (a) => `${a} sent you a message`,
  mention: (a) => `${a} mentioned you`,
  reaction: (a) => `${a} reacted to your post`,
  comment: (a) => `${a} commented on your post`,
  space_invite: (a) => `${a} invited you to a space`,
  friend_request: (a) => `${a} sent you a friend request`,
  friend_accept: (a) => `${a} accepted your friend request`,
  new_post: (a) => `${a} posted something new`,
  follow: (a) => `${a} started following you`,
};

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const { user_id, type, actor_username, body, channel_id, post_id } = payload;

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', user_id);
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const title = (TYPE_TITLE[type] ?? (() => `${actor_username} sent a notification`))(actor_username);
    const url = channel_id ? `/channels/me/${channel_id}` : post_id != null ? `/home?post=${post_id}` : '/notifications';

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush
          .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title, body, url }))
          .catch(async (err: { statusCode?: number }) => {
            // 410 Gone / 404 Not Found = the browser has permanently
            // unsubscribed this endpoint (uninstalled, cleared data,
            // etc.) — prune it so future notifications don't keep
            // paying the cost of a call that will never succeed again.
            if (err?.statusCode === 410 || err?.statusCode === 404) {
              await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            }
            throw err;
          })
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ sent, total: subs.length }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
