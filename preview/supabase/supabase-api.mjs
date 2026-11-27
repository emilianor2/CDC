export function makeSupabase(env) {
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_ADMIN_KEY: adminKey } = env;
  if (!(url === 'http://127.0.0.1:54321' || /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url ?? ''))
      || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? '') || !/^sb_secret_[A-Za-z0-9_-]+$/.test(adminKey ?? '')) {
    throw new Error('Supabase de prueba no configurado');
  }
  async function request(path, { token, admin, method, body, prefer } = {}) {
    const headers = { apikey: admin ? adminKey : key };
    if (token) headers.authorization = 'Bearer ' + token;
    if (body) headers['content-type'] = 'application/json';
    if (prefer) headers.prefer = prefer;
    return fetch(new URL(path, url), { headers, method, body: JSON.stringify(body) });
  }
  async function required(path, options) {
    const response = await request(path, options);
    if (!response.ok) throw new Error('No se pudo consultar Supabase de prueba');
    return response.json();
  }
  return {
    async actor(token) {
      if (!token) return null;
      const response = await request('/auth/v1/user', { token });
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) throw new Error('Supabase Auth no está disponible');
      const user = await response.json();
      const [profile] = await required('/rest/v1/perfiles?select=rol&usuario_id=eq.' + encodeURIComponent(user.id), { token });
      if (!['cliente', 'dueno', 'superadmin'].includes(profile?.rol)) return null;
      return { id: user.id, email: user.email.toLowerCase(), name: user.email, role: profile.rol, adminVerified: profile.rol === 'superadmin' };
    },
    async login(email, password) {
      const response = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
      if (!response.ok && response.status < 500) return null;
      if (!response.ok) throw new Error('Supabase Auth no está disponible');
      return response.json();
    },
    async logout(token) {
      if (token) await request('/auth/v1/logout?scope=local', { method: 'POST', token });
    },
    stateStore: {
      async read() {
        const [row] = await required('/rest/v1/club_preview_state?id=eq.demo&select=revision,document', { admin: true });
        if (!row) throw new Error('Faltan los datos de prueba');
        return { revision: row.revision, document: JSON.stringify(row.document) };
      },
      async write(document, previous) {
        const rows = await required('/rest/v1/club_preview_state?id=eq.demo&select=revision&revision=eq.' + previous.revision, {
          admin: true, method: 'PATCH', body: { revision: previous.revision + 1, document }, prefer: 'return=representation',
        });
        return rows.length === 1;
      },
    },
  };
}
