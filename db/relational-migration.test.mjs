import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { writeState } from './state-store.mjs';

test('migrates legacy cards and keeps SQL constraints and atomic revision checks', async context => {
  const sql = new DatabaseSync(':memory:');
  context.after(() => sql.close());
  const migrate = filename => sql.exec(readFileSync(new URL('../drizzle/' + filename, import.meta.url), 'utf8'));
  migrate('0000_unusual_roxanne_simpson.sql');

  const reward = { id: 'descuento', at: 3, label: '20% de descuento' };
  const time = '2026-11-25T12:00:00.000Z';
  const original = {
    admins: ['admin-test'],
    cafes: [{
      id: 'central', name: 'Café Central', city: 'Mendoza', sector: 'cafe',
      owner: 'Dueño de prueba', active: true, totalStamps: 8, milestones: [reward],
      cardDesign: { title: 'Mi tarjeta' },
    }],
    clients: [{
      id: 'cliente-test', cafe: 'central', name: 'Cliente de prueba', email: 'cliente@example.test',
      consent: false, consentAt: time, stamps: 5, rewards: 2, visitTotal: 13, cycle: 2,
      tokenHash: 'legacy-hash', cardProgram: { total: 8, milestones: [reward] },
      claimedRewardIds: [reward.id],
      rewardHistory: [
        { rewardId: 'retirado', at: 8, label: 'Café de la temporada anterior', cycle: 1, time },
        { rewardId: reward.id, at: reward.at, label: reward.label, cycle: 2, time },
      ],
    }],
  };
  sql.prepare("INSERT INTO app_state VALUES ('main', 7, ?)").run(JSON.stringify(original));
  migrate('0001_tablas_relacionales.sql');

  const row = sql.prepare('SELECT revision, document FROM estado_aplicacion').get();
  assert.equal(row.revision, 7);
  assert.deepEqual(JSON.parse(row.document), original);
  assert.deepEqual(JSON.parse(sql.prepare('SELECT document FROM app_state').get().document), {
    admins: original.admins,
  });
  assert.equal(sql.prepare('SELECT count(*) AS n FROM sellos').get().n, 5);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM canjes').get().n, 2);
  assert.equal(sql.prepare("SELECT descripcion FROM premios_tarjeta WHERE premio_id = 'retirado'").get().descripcion,
    'Café de la temporada anterior');
  assert.throws(() => sql.exec("INSERT INTO sellos VALUES ('inexistente', 1, 1)"), /FOREIGN KEY/);
  assert.throws(() => sql.exec("INSERT INTO canjes VALUES ('cliente-test', 2, 'inexistente', 2, 'hoy')"), /FOREIGN KEY/);
  assert.throws(() => sql.exec("INSERT INTO clientes SELECT 'otro', comercio_id, orden, nombre, email, consentimiento, consentimiento_en FROM clientes"), /UNIQUE/);

  const db = {
    prepare: query => ({
      bind: (...parameters) => ({
        run: async () => ({ meta: sql.prepare(query).run(...parameters) }),
      }),
    }),
  };
  const changed = structuredClone(original);
  changed.clients[0].stamps = 6;
  const invalid = structuredClone(changed);
  invalid.clients.push({ ...invalid.clients[0], id: 'duplicado' });
  await assert.rejects(writeState(db, invalid, row), /UNIQUE/);
  assert.equal(sql.prepare('SELECT revision FROM app_state').get().revision, 7);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM sellos').get().n, 5);
  assert.equal(await writeState(db, changed, row), true);
  assert.equal(await writeState(db, original, row), false);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM sellos').get().n, 6);
  sql.exec("DELETE FROM comercios WHERE id = 'central'");
  for (const table of ['clientes', 'tarjetas', 'sellos', 'premios', 'premios_tarjeta', 'canjes']) {
    assert.equal(sql.prepare('SELECT count(*) AS n FROM ' + table).get().n, 0, table);
  }
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(), []);
});
