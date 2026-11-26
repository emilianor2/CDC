const setupRoutes = new Map([
  ['GET /admin/setup', '/'],
  ['GET /admin/setup/api', '/api/state'],
  ['POST /admin/setup/api', '/api/admin-password'],
]);

export async function standaloneRequest(request) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith('oai-authenticated-user-')) headers.delete(name);
  }

  const destination = setupRoutes.get(`${request.method} ${url.pathname}`);
  if (!destination) return new Request(request, { headers });

  if (destination === '/' && (url.searchParams.get('panel') !== 'superadmin'
      || url.searchParams.get('password') !== 'setup')) {
    return Response.redirect(new URL('/admin/setup?panel=superadmin&password=setup', url), 303);
  }
  url.pathname = destination;
  url.search = '?panel=superadmin&password=setup';
  return new Request(new Request(url, request), { headers });
}
