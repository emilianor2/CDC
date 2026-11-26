import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const buildRoot = resolve(process.argv[2] ?? 'dist-release');
const configPath = resolve(buildRoot, 'dist/server/wrangler.json');
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const audience = process.env.CLOUDFLARE_ACCESS_AUD;

if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId ?? '')
    || databaseId === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Configurá CLOUDFLARE_D1_DATABASE_ID con el ID de la base D1 de producción.');
}
if (!/^[a-f0-9]{64}$/i.test(audience ?? '')) {
  throw new Error('Configurá CLOUDFLARE_ACCESS_AUD con el AUD de la aplicación de recuperación.');
}

const config = JSON.parse(await readFile(configPath, 'utf8'));
const database = config.d1_databases?.find(binding => binding.binding === 'DB');
if (!database) throw new Error('La compilación no contiene el binding DB.');

database.database_id = databaseId;
database.database_name = 'club-de-fans';
database.migrations_dir = '../../drizzle';
config.name = 'club-de-fans';
config.topLevelName = config.name;
config.workers_dev = false;
config.preview_urls = false;
config.routes = [{ pattern: 'clubdefans.ar', custom_domain: true }];
config.keep_vars = true;
config.vars = { ...config.vars, CLUB_STANDALONE: '1', CLUB_ACCESS_AUD: audience };

await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
