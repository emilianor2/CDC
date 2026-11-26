import assert from 'node:assert/strict';
import test from 'node:test';
import { standaloneRequest } from '../worker/standalone-auth.mjs';

const host = 'https://clubdefans.ar';
const spoofed = { 'oai-authenticated-user-id': 'spoofed', 'oai-authenticated-user-email': 'other@example.test' };

test('the standalone Worker strips identity headers on public and ordinary API routes', async () => {
  for (const path of ['/?join=central', '/api/state?panel=superadmin', '/api/admin-password']) {
    const request = new Request(host + path, { headers: spoofed });
    const result = await standaloneRequest(request);
    assert.equal(result.url, request.url);
    assert.equal(result.headers.get('oai-authenticated-user-id'), null);
    assert.equal(result.headers.get('oai-authenticated-user-email'), null);
  }
});

test('standalone setup routes map to recovery handlers without trusting identity headers', async () => {
  const page = await standaloneRequest(new Request(
    host + '/admin/setup?panel=superadmin&password=setup',
    { headers: spoofed },
  ));
  assert.equal(page.url, host + '/?panel=superadmin&password=setup');
  assert.equal(page.headers.get('oai-authenticated-user-id'), null);
  assert.equal(page.headers.get('oai-authenticated-user-email'), null);

  const input = JSON.stringify({ password: 'TestOnly123', otp: '123456' });
  const request = new Request(host + '/admin/setup/api', {
    method: 'POST',
    headers: { ...spoofed, 'content-type': 'application/json', origin: host },
    body: input,
  });
  const result = await standaloneRequest(request);
  assert.equal(result.url, host + '/api/admin-password?panel=superadmin&password=setup');
  assert.equal(result.method, 'POST');
  assert.equal(result.headers.get('origin'), host);
  assert.equal(result.headers.get('oai-authenticated-user-id'), null);
  assert.equal(result.headers.get('oai-authenticated-user-email'), null);
  assert.equal(await result.text(), input);
});
