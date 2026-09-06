# send-push

A Supabase Edge Function (Deno runtime), not part of the Next.js app —
that's why `supabase/functions` is excluded from the root `tsconfig.json`:
Deno globals (`Deno.env`, `Deno.serve`) and `npm:` specifier imports
aren't valid under the Next.js/Node TypeScript project, and never will
be; this isn't a gap, it's a different toolchain entirely.

## What it does

Called by the `on_notification_created_push` trigger
(`supabase/migrations/037_push_notifications.sql`) every time a row is
inserted into `notifications`. Looks up the target user's registered
devices (`push_subscriptions`) and sends each one a real Web Push
message via VAPID, pruning any subscription the push service reports
as permanently dead (410/404).

## Deploy

```
supabase functions deploy send-push
supabase secrets set VAPID_PUBLIC_KEY=<public key>
supabase secrets set VAPID_PRIVATE_KEY=<private key>
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically
to every edge function — no need to set those yourself.

You also need to point the database trigger at your service role key
(see the comment in `037_push_notifications.sql`):

```sql
alter database postgres set app.settings.service_role_key = '<your service_role key>';
```
