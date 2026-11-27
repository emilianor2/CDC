import { handleAPI } from '../../lib/backend.mjs';
import { makeSupabase } from './supabase-api.mjs';

const home = { superadmin: '/?panel=superadmin', dueno: '/?panel=owner', cliente: '/?join=cafe-norte' };
const customerPath = /^[\w-]{1,100}$/;
const json = (data, status) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });

function redirect(location, cookie) {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  if (cookie) headers.set('set-cookie', cookie);
  return new Response(null, { status: 303, headers });
}

function cookieConfig(url) {
  const local = url.hostname === '127.0.0.1';
  const name = local ? 'club_preview' : '__Host-club_preview';
  return { name, create: (token, age) => `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${local ? '' : '; Secure'}` };
}

function targetPage(from, role) {
  if (!from.startsWith('/') || from.startsWith('//')) return home[role];
  const url = new URL(from, 'https://preview.invalid');
  if (url.origin !== 'https://preview.invalid' || url.pathname !== '/') return home[role];
  const join = url.searchParams.get('join');
  const local = url.searchParams.get('local');
  if (role === 'cliente' && customerPath.test(join ?? '')) return '/?join=' + join;
  if (role !== 'cliente' && url.searchParams.get('panel') === 'owner' && customerPath.test(local ?? '')) {
    return '/?panel=owner&local=' + local;
  }
  return home[role];
}

function loginPage(next = '/', error = '') {
  const query = new URLSearchParams();
  if (next !== '/') query.set('next', next);
  if (error) query.set('error', error);
  return '/login' + (query.size ? '?' + query : '');
}

async function html(env, request, path) {
  const asset = await env.ASSETS.fetch(new Request(new URL(path, request.url)));
  const headers = new Headers(asset.headers);
  headers.set('cache-control', 'no-store');
  headers.set('referrer-policy', 'same-origin');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-robots-tag', 'noindex, nofollow');
  headers.set('content-security-policy', "frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  return new Response(asset.body, { status: asset.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (['/login.html', '/app.html'].includes(url.pathname)) return json({ error: 'Ruta no disponible.' }, 404);
    if (url.pathname !== '/' && !url.pathname.startsWith('/api/') && !['/login', '/logout'].includes(url.pathname)) {
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === '/login' && request.method === 'GET') return html(env, request, '/login.html');

    const cookie = cookieConfig(url);
    const token = request.headers.get('cookie')?.split(';').map(entry => entry.trim())
      .find(entry => entry.startsWith(cookie.name + '='))?.slice(cookie.name.length + 1);
    try {
      const supabase = makeSupabase(env);
      if (['/login', '/logout'].includes(url.pathname)) {
        if (request.method !== 'POST') return json({ error: 'Ruta no disponible.' }, 405);
        if (request.headers.get('origin') !== url.origin) return json({ error: 'Origen no permitido.' }, 403);
        if (url.pathname === '/logout') {
          try { await supabase.logout(token); } catch { /* Always clear the browser session. */ }
          return redirect('/', cookie.create('', 0));
        }
        if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
          return json({ error: 'Formulario inválido.' }, 415);
        }
        if (Number(request.headers.get('content-length') || 0) > 4096) return json({ error: 'Formulario demasiado grande.' }, 413);
        const raw = await request.text();
        if (raw.length > 4096) return json({ error: 'Formulario demasiado grande.' }, 413);
        const form = new URLSearchParams(raw);
        const email = (form.get('email') ?? '').trim();
        const password = form.get('password') ?? '';
        const next = (form.get('next') ?? '/').slice(0, 300);
        const session = email && email.length <= 160 && password && password.length <= 128
          ? await supabase.login(email, password) : null;
        const actor = await supabase.actor(session?.access_token);
        if (!actor) return redirect(loginPage(next, 'credentials'), cookie.create('', 0));
        return redirect(targetPage(next, actor.role), cookie.create(session.access_token, session.expires_in));
      }

      const actor = await supabase.actor(token);
      if (url.pathname === '/') {
        if (!actor) return url.search ? redirect(loginPage('/' + url.search)) : html(env, request, '/login.html');
        const desired = '/' + url.search;
        const target = targetPage(desired, actor.role);
        if (url.searchParams.has('join') && actor.role !== 'cliente') return redirect(loginPage(desired));
        if (target !== desired) return redirect(target);
        return html(env, request, '/app.html');
      }

      if (!actor) return json({ error: 'Iniciá sesión para continuar.' }, 401);
      if (url.pathname === '/api/enrollment-qr' && actor.role === 'cliente') return json({ error: 'Acceso restringido.' }, 403);
      const backendURL = new URL(url);
      backendURL.searchParams.delete('login');
      backendURL.searchParams.delete('password');
      return handleAPI(new Request(backendURL, request), {
        previewStateStore: supabase.stateStore,
        VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
        VAPID_SUBJECT: env.VAPID_SUBJECT,
      }, null, false, actor);
    } catch {
      if (url.pathname === '/login') return redirect(loginPage('/', 'unavailable'));
      return json({ error: 'No pudimos acceder al entorno de prueba. Intentá nuevamente.' }, 503);
    }
  },
};
