export default {
  fetch(request, env) {
    if (new URL(request.url).pathname !== '/config') return env.ASSETS.fetch(request);
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    const local = url === 'http://127.0.0.1:54321';
    const configured = (local || /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url ?? ''))
      && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? '');
    return Response.json(configured ? { url, key } : { error: 'Falta configurar el entorno de pruebas.' }, {
      status: configured ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  },
};
