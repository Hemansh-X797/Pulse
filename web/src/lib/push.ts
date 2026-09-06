import { supabase } from './supabase';

// Safe to expose — VAPID public keys are meant to be public, they're
// how the push service verifies which application server is allowed
// to send to a given subscription, not a secret. The matching private
// key stays server-side only, in the send-push edge function's
// environment (see supabase/functions/send-push/index.ts).
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
}

export async function getPushPermissionState(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Requests OS-level notification permission, subscribes this device
 * via the service worker's PushManager, and saves the subscription so
 * the send-push edge function can find it later. This is the piece
 * that makes notifications real in the Discord/Instagram sense — able
 * to arrive even when PalSpace isn't the focused tab, or isn't open at
 * all — as opposed to the in-app chime/badge, which only ever worked
 * while the tab itself was open.
 */
export async function enablePushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: "Push notifications aren't supported in this browser." };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'Permission was not granted.' };

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, reason: 'Not signed in.' };

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userData.user.id,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
    },
    { onConflict: 'endpoint' }
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function disablePushNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}
