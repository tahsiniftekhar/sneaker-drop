const sequelize = require('../config/database');

// Any constant works; it only has to be the same in every app instance.
const SWEEPER_LOCK_KEY = 72001;
const BATCH_SIZE = 500;

class ExpiryService {
  // Expires pending reservations whose deadline has passed and returns their units to stock,
  // in one transaction. Returns [{ dropId, availableStock, released }] for each drop it changed.
  //
  // State lives in the database, not in process timers, so a restart loses nothing: the next sweep
  // picks up every reservation that expired while the process was down.
  //
  // - The advisory lock makes the sweep single-flight across app instances, so two sweepers never
  //   update the same Drops rows in different orders (which could deadlock).
  // - SKIP LOCKED skips reservations a purchase is changing right now; if the purchase commits the
  //   row is no longer pending, and if it rolls back the next sweep takes it.
  // - status = 'pending' is re-checked by the UPDATE itself, the same condition PurchaseService
  //   uses, so a reservation is either purchased or expired, never both.
  //
  // `cutoff` exists for tests; production always uses now().
  static async sweep({ transaction, cutoff = null, limit = BATCH_SIZE } = {}) {
    const run = async (t) => {
      const [[{ acquired }]] = await sequelize.query(
        'SELECT pg_try_advisory_xact_lock(:key) AS acquired',
        { replacements: { key: SWEEPER_LOCK_KEY }, transaction: t }
      );
      if (!acquired) return [];

      const [rows] = await sequelize.query(
        `WITH due AS (
           SELECT id FROM "Reservations"
           WHERE status = 'pending' AND "expiresAt" <= COALESCE(CAST(:cutoff AS timestamptz), now())
           ORDER BY "expiresAt"
           LIMIT :limit
           FOR UPDATE SKIP LOCKED
         ),
         expired AS (
           UPDATE "Reservations" r
           SET status = 'expired', "updatedAt" = now()
           FROM due
           WHERE r.id = due.id AND r.status = 'pending'
           RETURNING r.drop_id
         ),
         released AS (
           SELECT drop_id, count(*)::int AS n FROM expired GROUP BY drop_id
         )
         UPDATE "Drops" d
         SET "availableStock" = d."availableStock" + released.n, "updatedAt" = now()
         FROM released
         WHERE d.id = released.drop_id
         RETURNING d.id AS "dropId", d."availableStock" AS "availableStock", released.n AS released`,
        { replacements: { cutoff, limit }, transaction: t }
      );
      return rows;
    };

    return transaction ? run(transaction) : sequelize.transaction(run);
  }

  // Sweeps immediately (recovering anything that expired while the process was down), then every
  // intervalMs. Sweeps never overlap. Returns a function that stops the loop.
  static start(io, { intervalMs = Number(process.env.EXPIRY_SWEEP_INTERVAL_MS) || 5000 } = {}) {
    let timer = null;
    let stopped = false;

    const tick = async () => {
      try {
        let changed;
        do {
          changed = await ExpiryService.sweep();
          for (const { dropId, availableStock, released } of changed) {
            io?.emit('stock_updated', { dropId, availableStock });
            console.log(`Expired ${released} reservation(s) on drop ${dropId}; stock now ${availableStock}.`);
          }
          // A full batch means more may be due; keep going until a sweep comes back short.
        } while (!stopped && changed.reduce((sum, row) => sum + row.released, 0) >= BATCH_SIZE);
      } catch (error) {
        console.error('Expiry sweep failed:', error.message);
      } finally {
        if (!stopped) timer = setTimeout(tick, intervalMs);
      }
    };

    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }
}

module.exports = ExpiryService;
