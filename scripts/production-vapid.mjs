import { writeFile } from 'node:fs/promises';

const [bindingsJSON, path] = process.argv.slice(2);
const bindings = new Set(JSON.parse(bindingsJSON));
const publicKeyExists = bindings.has('VAPID_PUBLIC_KEY');
const privateKeyExists = bindings.has('VAPID_PRIVATE_KEY');
if (publicKeyExists !== privateKeyExists) {
  throw new Error('El Worker tiene un par VAPID incompleto. Recuperá la clave faltante antes de publicar.');
}

const secrets = {};
if (!publicKeyExists) {
  let keys;
  try {
    keys = JSON.parse(process.env.PRODUCTION_VAPID);
  } catch {
    throw new Error('El secreto PRODUCTION_VAPID debe contener un par VAPID en JSON.');
  }
  if (!/^B[A-Za-z0-9_-]{86}$/.test(keys?.VAPID_PUBLIC_KEY) || !/^[A-Za-z0-9_-]{43}$/.test(keys?.VAPID_PRIVATE_KEY)) {
    throw new Error('El secreto PRODUCTION_VAPID tiene un formato inválido.');
  }
  secrets.VAPID_PUBLIC_KEY = keys.VAPID_PUBLIC_KEY;
  secrets.VAPID_PRIVATE_KEY = keys.VAPID_PRIVATE_KEY;
}
if (!bindings.has('VAPID_SUBJECT')) secrets.VAPID_SUBJECT = 'https://clubdefans.ar';

await writeFile(path, JSON.stringify(secrets), { mode: 0o600 });
console.log(publicKeyExists ? 'Se conserva el par VAPID activo.' : 'Se preparó un par VAPID para producción.');
