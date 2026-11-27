export function GET(request: Request) {
  return Response.redirect(new URL('/?panel=superadmin', request.url), 302);
}
