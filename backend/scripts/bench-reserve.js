// Reservation throughput on one hot drop row: conditional UPDATE vs SELECT ... FOR UPDATE.
//
//   BENCH_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/sneaker-drop-bench-test \
//     [BENCH_OPS=3000] [BENCH_WARMUP=200] node scripts/bench-reserve.js
//
// Destructive: truncates Users/Drops/Reservations/Purchases, so it refuses to run unless the
// database name ends in "-test". Each reservation uses a distinct user (one pending hold per user
// per drop), and the tables are reseeded before every run.
const url = process.env.BENCH_DATABASE_URL;
const dbName = url ? decodeURIComponent(new URL(url).pathname.slice(1)) : '';
if (!dbName.endsWith('-test')) {
  console.error(`Refusing to run: BENCH_DATABASE_URL must name a database ending in "-test" (got "${dbName}").`);
  process.exit(1);
}
process.env.DATABASE_URL = url;
process.env.DB_POOL_MAX = process.env.DB_POOL_MAX || '64';
process.env.RESERVATION_TTL_SECONDS = '3600';

const sequelize = require('../src/config/database');
const ReservationService = require('../src/services/ReservationService');

const OPS = Number(process.env.BENCH_OPS) || 3000;
const WARMUP = Number(process.env.BENCH_WARMUP) || 200;
const STOCK = 1000000;
const LEVELS = [1, 8, 32, 64];
const TTL = ReservationService.TTL_SECONDS;

async function seed(users) {
  await sequelize.query('TRUNCATE "Purchases","Reservations","Drops","Users" RESTART IDENTITY CASCADE');
  await sequelize.query(
    `INSERT INTO "Users" (username, "createdAt", "updatedAt")
     SELECT 'user' || i, now(), now() FROM generate_series(1, :users) i`,
    { replacements: { users } }
  );
  await sequelize.query(
    `INSERT INTO "Drops" (name, price, "totalStock", "availableStock", "createdAt", "updatedAt")
     VALUES ('bench', 100, :s, :s, now(), now())`,
    { replacements: { s: STOCK } }
  );
}

const strategies = {
  conditional: (userId) => ReservationService.reserve(userId, 1),
  'select-for-update': (userId) =>
    sequelize.transaction(async (t) => {
      const [[row]] = await sequelize.query('SELECT "availableStock" FROM "Drops" WHERE id = 1 FOR UPDATE', {
        transaction: t,
      });
      if (!row || row.availableStock <= 0) throw new Error('sold out');
      await sequelize.query(
        'UPDATE "Drops" SET "availableStock" = :n, "updatedAt" = now() WHERE id = 1',
        { replacements: { n: row.availableStock - 1 }, transaction: t }
      );
      await sequelize.query(
        `INSERT INTO "Reservations" (user_id, drop_id, status, "expiresAt", "createdAt", "updatedAt")
         VALUES (:userId, 1, 'pending', now() + make_interval(secs => :ttl), now(), now())
         RETURNING *`,
        { replacements: { userId, ttl: TTL }, transaction: t }
      );
    }),
};

// Runs `count` ops over `c` workers; user ids are handed out from `next`.
async function drive(fn, c, count, startId, latencies) {
  let next = startId;
  const end = startId + count;
  const worker = async () => {
    while (next < end) {
      const id = next++;
      const t0 = process.hrtime.bigint();
      await fn(id);
      if (latencies) latencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
  };
  await Promise.all(Array.from({ length: c }, worker));
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

async function run(name, c) {
  await seed(OPS + WARMUP);
  const fn = strategies[name];
  await drive(fn, c, WARMUP, 1);
  const lat = [];
  const t0 = process.hrtime.bigint();
  await drive(fn, c, OPS, WARMUP + 1, lat);
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  lat.sort((a, b) => a - b);
  const [[d]] = await sequelize.query('SELECT "totalStock","availableStock" FROM "Drops" WHERE id = 1');
  const [[{ n }]] = await sequelize.query(`SELECT count(*)::int AS n FROM "Reservations" WHERE status = 'pending'`);
  const ok = d.availableStock + n === d.totalStock && n === OPS + WARMUP;
  return { name, c, ops: OPS / secs, p50: pct(lat, 50), p99: pct(lat, 99), ok };
}

(async () => {
  const rows = [];
  for (const name of Object.keys(strategies)) {
    for (const c of LEVELS) {
      const r = await run(name, c);
      rows.push(r);
      console.error(`${name} C=${c}: ${r.ops.toFixed(0)} ops/s`);
    }
  }
  console.log(`\nN=${OPS} ops per run (+${WARMUP} warmup), pool=${process.env.DB_POOL_MAX}\n`);
  console.log('| strategy | C | ops/sec | p50 ms | p99 ms | stock invariant |');
  console.log('|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.name} | ${r.c} | ${r.ops.toFixed(0)} | ${r.p50.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.ok ? 'ok' : 'VIOLATED'} |`);
  }
  await sequelize.close();
  if (rows.some((r) => !r.ok)) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
