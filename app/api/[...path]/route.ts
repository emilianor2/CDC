import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleAPI } from '../../../lib/backend.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return handleAPI(request, env, await getChatGPTUser()); }
export async function POST(request: Request) { return handleAPI(request, env, await getChatGPTUser()); }
