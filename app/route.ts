import { UI } from '../lib/client/render';
export const dynamic = 'force-dynamic';
export async function GET() { return new Response(UI, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } }); }
