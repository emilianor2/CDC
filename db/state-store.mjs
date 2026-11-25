const STATE_ID = 'main';
const READ_STATE = 'SELECT revision, document FROM estado_aplicacion WHERE id = ?';

function changedRecords(records, previousRecords) {
  const previous = new Map(previousRecords.map((item, ordinal) => [item.id, { item, ordinal }]));
  const upserts = [];
  for (const [ordinal, item] of records.entries()) {
    const before = previous.get(item.id);
    if (!before || before.ordinal !== ordinal || JSON.stringify(before.item) !== JSON.stringify(item)) {
      upserts.push({ ordinal, item });
    }
    previous.delete(item.id);
  }
  return { upserts, deleted: [...previous.keys()] };
}

function encodeState(state, previous = { cafes: [], clients: [] }) {
  const { cafes, clients, ...document } = state;
  const businesses = changedRecords(cafes, previous.cafes);
  const customers = changedRecords(clients, previous.clients);
  return JSON.stringify({
    ...document,
    __relational: {
      cafes: businesses.upserts,
      clients: customers.upserts,
      deletedCafes: businesses.deleted,
      deletedClients: customers.deleted,
    },
  });
}

export async function readState(db, seed) {
  const current = await db.prepare(READ_STATE).bind(STATE_ID).first();
  if (current) return current;
  await db.prepare(
    'INSERT INTO app_state (id, revision, document) VALUES (?, 0, ?) ON CONFLICT (id) DO NOTHING',
  ).bind(STATE_ID, encodeState(seed())).run();
  return db.prepare(READ_STATE).bind(STATE_ID).first();
}

export async function writeState(db, state, previous) {
  const result = await db.prepare(
    'UPDATE app_state SET document = ?, revision = revision + 1 WHERE id = ? AND revision = ?',
  ).bind(encodeState(state, JSON.parse(previous.document)), STATE_ID, previous.revision).run();
  return result.meta.changes > 0;
}
