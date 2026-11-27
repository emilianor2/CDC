import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const { x, y, d } = privateKey.export({ format: 'jwk' });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(x, 'base64url'), Buffer.from(y, 'base64url')]);
process.stdout.write(JSON.stringify({
  VAPID_PUBLIC_KEY: publicKey.toString('base64url'),
  VAPID_PRIVATE_KEY: d,
}));
