import { cp, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../../lib/client/', import.meta.url);
const destination = new URL('./.assets/', import.meta.url);
const [page, styles, ...scripts] = await Promise.all(
  ['index.html', 'styles.css', 'app.js', 'card-design.js', 'poster-design.js', 'client-adapter.js']
    .map(name => readFile(new URL(name, source), 'utf8')),
);
const preview = await readFile(new URL('./preview-ui.js', import.meta.url), 'utf8');
const login = await readFile(new URL('./login.html', import.meta.url), 'utf8');
const app = page
  .replace('<meta name="referrer" content="no-referrer">', '')
  .replace('<style></style>', () => '<style>' + styles + '</style>')
  .replace('<script></script>', () => '<script>' + scripts.concat(preview).join('\n') + '</script>');

await cp(new URL('../../public/', import.meta.url), destination, { recursive: true });
await Promise.all([
  writeFile(new URL('app.html', destination), app),
  writeFile(new URL('login.html', destination), login.replace('<style></style>', () => '<style>' + styles + '</style>')),
]);
