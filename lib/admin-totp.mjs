const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function adminTotpSecret(env, email) {
  try {
    const secrets = JSON.parse(env.SUPERADMIN_TOTP_SECRETS || '{}');
    const secret = Object.hasOwn(secrets, email) ? secrets[email] : '';
    return typeof secret === 'string' && /^[A-Z2-7]{32}$/.test(secret) ? secret : null;
  } catch {
    return null;
  }
}

export async function matchTotpStep(secret, code, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const bytes = new Uint8Array(20);
  let bits = 0;
  let buffer = 0;
  let index = 0;
  for (const char of secret) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = buffer >>> bits;
    }
  }
  const key = await crypto.subtle.importKey('raw', bytes, {name:'HMAC', hash:'SHA-1'}, false, ['sign']);
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    const counter = new DataView(new ArrayBuffer(8));
    counter.setBigUint64(0, BigInt(step));
    const mac = new DataView(await crypto.subtle.sign('HMAC', key, counter));
    const offset = mac.getUint8(mac.byteLength - 1) & 15;
    const expected = ((mac.getUint32(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
    let difference = 0;
    for (let i = 0; i < 6; i++) difference |= code.charCodeAt(i) ^ expected.charCodeAt(i);
    if (difference === 0) return step;
  }
  return null;
}
