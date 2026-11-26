import { buildPushPayload } from '@block65/webcrypto-web-push';

export function pushConfigured(env) {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export function pushSubscription(input) {
  let endpoint;
  try {
    endpoint = new URL(input?.endpoint);
  } catch {
    return null;
  }
  const apple = endpoint.hostname.endsWith('.push.apple.com');
  const firebase = endpoint.hostname === 'fcm.googleapis.com' && endpoint.pathname.startsWith('/fcm/send/');
  const mozilla = endpoint.hostname === 'updates.push.services.mozilla.com' && endpoint.pathname.startsWith('/wpush/');
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password
      || endpoint.search || endpoint.hash || endpoint.href.length > 2048 || !(apple || firebase || mozilla)) return null;

  const { p256dh, auth } = input.keys || {};
  if (typeof p256dh !== 'string' || typeof auth !== 'string'
      || !/^B[A-Za-z0-9_-]{86}$/.test(p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(auth)) return null;
  return { endpoint: endpoint.href, expirationTime: null, keys: { p256dh, auth } };
}

export async function sendPush(subscription, data, env) {
  try {
    const payload = await buildPushPayload({ data, options: { ttl: 3600 } }, subscription, {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    });
    const response = await fetch(subscription.endpoint, {
      ...payload,
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel();
    if (response.ok) return 'accepted';
    if (response.status === 404 || response.status === 410) return 'expired';
  } catch {
    return 'failed';
  }
  return 'failed';
}
