// Integration tests for the reserve -> purchase -> expire lifecycle against a real Postgres.
//
//   TEST_DATABASE_URL=postgres://user:pw@localhost:5432/sneaker-drop-test npm run test:db
//
// The suite drops and recreates the public schema, so it refuses to run unless the database
// name ends in "-test".
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const url = process.env.TEST_DATABASE_URL;
const dbName = url ? decodeURIComponent(new URL(url).pathname.slice(1)) : '';
if (!dbName.endsWith('-test')) {
  console.error(`Refusing to run: TEST_DATABASE_URL must name a database ending in "-test" (got "${dbName}").`);
  process.exit(1);
}
process.env.DATABASE_URL = url;
process.env.DB_POOL_MAX = '20';
process.env.RESERVATION_TTL_SECONDS = '60';

const sequelize = require('../src/config/database');
const ReservationService = require('../src/services/ReservationService');
const PurchaseService = require('../src/services/PurchaseService');
const ExpiryService = require('../src/services/ExpiryService');

const ROOT = path.resolve(__dirname, '..');
const FAR_FUTURE = '2999-01-01T00:00:00Z';

const sql = async (query, replacements = {}) => (await sequelize.query(query, { replacements }))[0];
const one = async (query, replacements) => (await sql(query, replacements))[0];

async function seed({ users = 1, stock = 1 } = {}) {
  await sql('TRUNCATE "Purchases", "Reservations", "Drops", "Users" RESTART IDENTITY CASCADE');
  await sql(
    `INSERT INTO "Users" (username, "createdAt", "updatedAt")
     SELECT 'user' || i, now(), now() FROM generate_series(1, :users) i`,
    { users }
  );
  await sql(
    `INSERT INTO "Drops" (name, price, "totalStock", "availableStock", "createdAt", "updatedAt")
     VALUES ('Test Drop', 100, :stock, :stock, now(), now())`,
    { stock }
  );
  return { dropId: 1 };
}

const stock = async () => (await one('SELECT "availableStock" AS n FROM "Drops" WHERE id = 1')).n;
const statusOf = async (id) => (await one('SELECT status FROM "Reservations" WHERE id = :id', { id })).status;
const count = async (table, where = 'true') =>
  Number((await one(`SELECT count(*) AS n FROM "${table}" WHERE ${where}`)).n);

// Every unit is in exactly one place: on sale, held by a pending reservation, or sold.
async function assertStockConserved(total) {
  const available = await stock();
  const pending = await count('Reservations', "status = 'pending'");
  const completed = await count('Reservations', "status = 'completed'");
  const purchases = await count('Purchases');
  assert.equal(available + pending + completed, total, 'available + pending + completed = totalStock');
  assert.equal(purchases, completed, 'one purchase per completed reservation');
}

// Waits until `n` backends in this database are blocked on a lock: proof that a statement is
// queued behind a transaction the test is holding open, so the interleaving is the one intended.
async function waitForLockWaiters(n) {
  for (let i = 0; i < 200; i++) {
    const { waiting } = await one(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`
    );
    if (waiting >= n) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for ${n} lock waiter(s)`);
}

// Starts a sweep while `holder` (an open transaction) holds locks, then ends the holder with
// `finish` ('commit' or 'rollback'). Reports whether the sweep returned on its own or queued
// behind the holder. The holder always ends before the sweep is awaited, so a sweeper that blocks
// fails the test's assertions instead of deadlocking it.
async function sweepWhileHeld(holder, finish, options = { cutoff: FAR_FUTURE }) {
  const sweep = ExpiryService.sweep(options);
  const outcome = await Promise.race([
    sweep.then(() => 'returned'),
    waitForLockWaiters(1).then(() => 'blocked'),
  ]);
  await holder[finish]();
  return { outcome, result: await sweep };
}

const settle = (promises) => Promise.allSettled(promises);
const codes = (results) => results.map((r) => (r.status === 'fulfilled' ? 'ok' : r.reason.code));
const tally = (list) => list.reduce((acc, c) => ({ ...acc, [c]: (acc[c] || 0) + 1 }), {});

before(async () => {
  await sql('DROP SCHEMA IF EXISTS public CASCADE');
  await sql('CREATE SCHEMA public');
  execFileSync(path.join(ROOT, 'node_modules', '.bin', 'sequelize-cli'), ['db:migrate'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
});

beforeEach(() => seed());
after(() => sequelize.close());

// ---------------------------------------------------------------------------------------------
// Reserving

test('concurrent reservations never oversell', async () => {
  await seed({ users: 40, stock: 10 });
  const results = await settle(
    Array.from({ length: 40 }, (_, i) => ReservationService.reserve(i + 1, 1))
  );
  assert.deepEqual(tally(codes(results)), { ok: 10, SOLD_OUT: 30 });
  assert.equal(await stock(), 0);
  await assertStockConserved(10);
});

test('a user cannot hold two pending reservations for the same drop, even concurrently', async () => {
  await seed({ users: 1, stock: 10 });
  const results = await settle(Array.from({ length: 10 }, () => ReservationService.reserve(1, 1)));
  assert.deepEqual(tally(codes(results)), { ok: 1, ALREADY_RESERVED: 9 });
  assert.equal(await stock(), 9, 'rejected attempts returned their unit');
  await assertStockConserved(10);
});

test('a user can reserve again once their earlier reservation has expired', async () => {
  await seed({ users: 1, stock: 2 });
  await ReservationService.reserve(1, 1);
  await ExpiryService.sweep({ cutoff: FAR_FUTURE });
  const { reservation } = await ReservationService.reserve(1, 1);
  assert.equal(reservation.status, 'pending');
  await assertStockConserved(2);
});

// 'queued' once `n` backends wait on a lock, or 'settled' if `promise` finishes first. Never
// rejects, so a test always gets to end the transaction it holds and fails on its assertions
// instead of hanging.
const queuedOrSettled = (promise, n) =>
  Promise.race([
    promise.then(() => 'settled', () => 'settled'),
    waitForLockWaiters(n).then(() => 'queued', () => 'timed out'),
  ]);

test('reserving again while the hold is still live is refused and keeps the hold', async () => {
  await seed({ users: 1, stock: 2 });
  const { reservation } = await ReservationService.reserve(1, 1);
  await assert.rejects(ReservationService.reserve(1, 1), { code: 'ALREADY_RESERVED' });
  assert.equal(await statusOf(reservation.id), 'pending');
  assert.equal(await stock(), 1);
  await assertStockConserved(2);
});

const makeOverdue = (id) =>
  sql(`UPDATE "Reservations" SET "expiresAt" = now() - interval '1 second' WHERE id = :id`, { id });

test('a user can reserve again right after their deadline, before the sweeper has run', async () => {
  // One unit, held by the user's own overdue reservation: the drop looks sold out until that hold
  // is released, so reserve has to release it itself rather than wait for the next sweep.
  const { reservation: old } = await ReservationService.reserve(1, 1);
  await makeOverdue(old.id);

  const { reservation, availableStock } = await ReservationService.reserve(1, 1);
  assert.notEqual(reservation.id, old.id);
  assert.equal(reservation.status, 'pending');
  assert.equal(availableStock, 0, 'the released unit was taken again: net stock change 0');
  assert.equal(await statusOf(old.id), 'expired');
  assert.deepEqual(await ExpiryService.sweep(), [], 'nothing left for the sweeper to release');
  await assertStockConserved(1);
});

test('re-reserving while the sweeper expires the same reservation does not deadlock', async () => {
  // Two units, so reserve's decrement goes through without the released one.
  await seed({ users: 1, stock: 2 });
  const { reservation: old } = await ReservationService.reserve(1, 1);
  await makeOverdue(old.id);

  // A third transaction holds the Drops row so both sides queue in a chosen order: reserve first,
  // then the sweep. If reserve took the Drops lock before touching the overdue reservation, the
  // sweep would hold that reservation and wait for Drops while reserve's INSERT waited on the
  // sweep's uncommitted index entry, and Postgres would abort one of them as a deadlock.
  const blocker = await sequelize.transaction();
  await sequelize.query('UPDATE "Drops" SET "updatedAt" = now() WHERE id = 1', { transaction: blocker });
  const reserve = ReservationService.reserve(1, 1);
  const sweep = queuedOrSettled(reserve, 1).then(() => ExpiryService.sweep());
  const outcome = await queuedOrSettled(sweep, 2);
  await blocker.commit();
  const results = await settle([reserve, sweep]);

  assert.deepEqual(codes(results), ['ok', 'ok'], 'neither side was aborted');
  assert.equal(outcome, 'settled', 'the sweep skipped the reservation reserve had already claimed');
  assert.deepEqual(results[1].value, []);
  assert.equal(await statusOf(old.id), 'expired');
  assert.equal(results[0].value.reservation.status, 'pending');
  await assertStockConserved(2);
});

test('re-reserving while a sweep that already expired the reservation commits', async () => {
  const { reservation: old } = await ReservationService.reserve(1, 1);
  await makeOverdue(old.id);

  const sweep = await sequelize.transaction();
  const released = await ExpiryService.sweep({ transaction: sweep });
  assert.equal(released[0].released, 1);

  // reserve has to wait for the sweep on the reservation row. Checking stock first would see the
  // committed 0 and answer SOLD_OUT without waiting for the unit the sweep is about to return.
  const reserve = ReservationService.reserve(1, 1);
  const outcome = await queuedOrSettled(reserve, 1);
  await sweep.commit();
  assert.equal(outcome, 'queued', 'reserve waited for the sweep');

  const { reservation, availableStock } = await reserve;
  assert.equal(reservation.status, 'pending');
  assert.equal(availableStock, 0, 'the unit was returned once, by the sweep, and taken once');
  assert.equal(await statusOf(old.id), 'expired');
  await assertStockConserved(1);
});

test('unknown drop and unknown user are reported, not 500s, and leave stock untouched', async () => {
  await seed({ users: 1, stock: 1 });
  await assert.rejects(ReservationService.reserve(1, 999), { code: 'DROP_NOT_FOUND' });
  await assert.rejects(ReservationService.reserve(999, 1), { code: 'USER_NOT_FOUND' });
  assert.equal(await stock(), 1);
});

test('the database refuses negative stock even if application code tries', async () => {
  await assert.rejects(sql('UPDATE "Drops" SET "availableStock" = -1 WHERE id = 1'), /drops_available_stock_range/);
});

// ---------------------------------------------------------------------------------------------
// Purchasing

test('concurrent purchases of one reservation create exactly one purchase', async () => {
  const { reservation } = await ReservationService.reserve(1, 1);
  const results = await Promise.all(
    Array.from({ length: 10 }, () => PurchaseService.purchase(1, reservation.id))
  );
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(new Set(results.map((r) => r.purchase.id)).size, 1, 'every caller gets the same purchase');
  assert.equal(await count('Purchases'), 1);
  await assertStockConserved(1);
});

test('retrying a completed purchase returns the original purchase', async () => {
  const { reservation } = await ReservationService.reserve(1, 1);
  const first = await PurchaseService.purchase(1, reservation.id);
  const retry = await PurchaseService.purchase(1, reservation.id);
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(retry.purchase.id, first.purchase.id);
});

test("a user cannot purchase someone else's reservation", async () => {
  await seed({ users: 2, stock: 1 });
  const { reservation } = await ReservationService.reserve(1, 1);
  await assert.rejects(PurchaseService.purchase(2, reservation.id), { code: 'RESERVATION_NOT_FOUND' });
  assert.equal(await statusOf(reservation.id), 'pending');
});

test('a reservation past its deadline cannot be purchased even before the sweeper runs', async () => {
  const { reservation } = await ReservationService.reserve(1, 1);
  await sql(`UPDATE "Reservations" SET "expiresAt" = now() - interval '1 second' WHERE id = :id`, {
    id: reservation.id,
  });
  await assert.rejects(PurchaseService.purchase(1, reservation.id), { code: 'RESERVATION_EXPIRED' });
  assert.equal(await statusOf(reservation.id), 'pending', 'still pending until the sweeper releases it');
  await ExpiryService.sweep();
  assert.equal(await statusOf(reservation.id), 'expired');
  assert.equal(await stock(), 1, 'unit returned exactly once');
});

// ---------------------------------------------------------------------------------------------
// Purchase vs expiry. Both paths leave 'pending' through a conditional UPDATE on the same row.
// These tests hold one side's transaction open, prove the other side is queued behind it (or
// skipped it), then commit, so each interleaving is forced rather than left to timing.

test('expiry commits first: the waiting purchase is refused and stock is returned once', async () => {
  const { reservation } = await ReservationService.reserve(1, 1);

  const sweep = await sequelize.transaction();
  const released = await ExpiryService.sweep({ transaction: sweep, cutoff: FAR_FUTURE });
  assert.equal(released.length, 1);

  const purchase = PurchaseService.purchase(1, reservation.id);
  await waitForLockWaiters(1);
  await sweep.commit();

  await assert.rejects(purchase, { code: 'RESERVATION_EXPIRED' });
  assert.equal(await statusOf(reservation.id), 'expired');
  assert.equal(await count('Purchases'), 0);
  assert.equal(await stock(), 1);
  await assertStockConserved(1);
});

test('purchase commits first: the sweeper skips the row and never returns the sold unit', async () => {
  const { reservation } = await ReservationService.reserve(1, 1);

  const buy = await sequelize.transaction();
  const { created } = await PurchaseService.purchase(1, reservation.id, { transaction: buy });
  assert.equal(created, true);

  // The purchase holds the row lock. The sweep must skip the row, not queue behind it. Waiting would
  // still leave the data correct (the status re-check sees 'completed'), but it stalls expiry for
  // every instance while the purchase is open: a liveness check, not a data one.
  const { outcome, result } = await sweepWhileHeld(buy, 'commit');
  assert.equal(outcome, 'returned', 'the sweep skipped the locked row instead of waiting on it');
  assert.deepEqual(result, []);

  // Once committed the row is no longer pending, so later sweeps ignore it too.
  assert.deepEqual(await ExpiryService.sweep({ cutoff: FAR_FUTURE }), []);
  assert.equal(await statusOf(reservation.id), 'completed');
  assert.equal(await stock(), 0);
  await assertStockConserved(1);
});

test('purchase rolls back: the next sweep still expires the reservation', async () => {
  const { reservation } = await ReservationService.reserve(1, 1);

  const buy = await sequelize.transaction();
  await PurchaseService.purchase(1, reservation.id, { transaction: buy });
  const { outcome, result } = await sweepWhileHeld(buy, 'rollback');
  assert.equal(outcome, 'returned');
  assert.deepEqual(result, [], 'skipped while the purchase was in flight');

  const released = await ExpiryService.sweep({ cutoff: FAR_FUTURE });
  assert.equal(released[0].released, 1);
  assert.equal(await statusOf(reservation.id), 'expired');
  await assertStockConserved(1);
});

test('stress: random purchases racing sweeps keep every unit accounted for', async () => {
  const total = 30;
  await seed({ users: 60, stock: total });

  for (let round = 0; round < 5; round++) {
    const reserved = (
      await settle(Array.from({ length: 60 }, (_, i) => ReservationService.reserve(i + 1, 1)))
    )
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value.reservation);

    // Every reservation is attacked by a purchase (sometimes twice) while sweeps that consider
    // everything already expired run in parallel.
    await settle([
      ...reserved.flatMap((r) => {
        const p = [PurchaseService.purchase(r.user_id, r.id)];
        if (r.id % 3 === 0) p.push(PurchaseService.purchase(r.user_id, r.id));
        return p;
      }),
      ...Array.from({ length: 5 }, () => ExpiryService.sweep({ cutoff: FAR_FUTURE })),
    ]);
    await ExpiryService.sweep({ cutoff: FAR_FUTURE });
    await assertStockConserved(total);
    assert.equal(await count('Reservations', "status = 'pending'"), 0);
  }
});

// ---------------------------------------------------------------------------------------------
// Sweeper

test('only one sweeper runs at a time across instances', async () => {
  await seed({ users: 2, stock: 2 });
  await ReservationService.reserve(1, 1);
  await ReservationService.reserve(2, 1);

  // The first instance's sweep takes one due reservation and stays open.
  const first = await sequelize.transaction();
  const taken = await ExpiryService.sweep({ transaction: first, cutoff: FAR_FUTURE, limit: 1 });
  assert.equal(taken[0].released, 1);

  // Another due reservation is unlocked, so only the advisory lock stops a second instance taking
  // it. Without the lock the second sweep would queue on the Drops row the first one holds (and
  // with several drops, two sweepers could lock them in different orders and deadlock).
  const { outcome, result } = await sweepWhileHeld(first, 'commit');
  assert.equal(outcome, 'returned', 'second sweep backed off instead of queueing behind the first');
  assert.deepEqual(result, []);

  assert.equal((await ExpiryService.sweep({ cutoff: FAR_FUTURE }))[0].released, 1);
  await assertStockConserved(2);
});

test('reservations that expired while the process was down are released on startup', async () => {
  await seed({ users: 3, stock: 5 });
  for (const user of [1, 2, 3]) await ReservationService.reserve(user, 1);
  // Simulate downtime: the deadlines passed and no process was running to act on them.
  await sql(`UPDATE "Reservations" SET "expiresAt" = now() - interval '10 minutes'`);
  assert.equal(await stock(), 2);

  const events = [];
  const io = { emit: (name, payload) => events.push({ name, payload }) };
  const stop = ExpiryService.start(io, { intervalMs: 60000 });
  for (let i = 0; i < 100 && events.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
  stop();

  assert.equal(await stock(), 5);
  assert.equal(await count('Reservations', "status = 'expired'"), 3);
  assert.deepEqual(events, [{ name: 'stock_updated', payload: { dropId: 1, availableStock: 5 } }]);
});
