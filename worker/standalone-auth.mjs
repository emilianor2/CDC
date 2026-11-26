const setupRoutes = new Map([
  ['GET /admin/setup', '/'],
  ['GET /admin/setup/api', '/api/state'],
  ['POST /admin/setup/api', '/api/admin-password'],
]);

export async function standaloneRequest(request, access, audience) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith('oai-authenticated-user-')) headers.delete(name);
  }

  const destination = setupRoutes.get(`${request.method} ${url.pathname}`);
  if (!destination) return new Request(request, { headers });

  const identity = audience && access?.aud === audience ? await access.getIdentity() : null;
  const email = identity?.email?.trim().toLowerCase();
  if (!email) return new Response('Se requiere un acceso de administración autorizado.', { status: 403 });

  headers.set('oai-authenticated-user-id', 'access:' + email);
  headers.set('oai-authenticated-user-email', email);
  if (destination === '/' && (url.searchParams.get('panel') !== 'superadmin'
      || url.searchParams.get('password') !== 'setup')) {
    return Response.redirect(new URL('/admin/setup?panel=superadmin&password=setup', url), 303);
  }
  url.pathname = destination;
  url.search = '?panel=superadmin&password=setup';
  return new Request(new Request(url, request), { headers });
}
