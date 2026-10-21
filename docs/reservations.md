# Reservation consistency

Design note for the reserve -> purchase -> expire lifecycle in `backend/src/services/`
(`ReservationService`, `PurchaseService`, `ExpiryService`) and the database guarantees added in
`backend/src/migrations/20261021120000-reservation-consistency.js`. The aim is that correctness
comes from the database, not from application timing, so it holds across restarts, multiple app
instances, retries and concurrent requests.

## 1. Lifecycle

```
reserve ──> pending ──> completed   (purchase, before expiresAt)
               └──────> expired     (sweeper, after expiresAt)
```

- `reserve` takes one unit of stock and creates a `pending` reservation with
  `expiresAt = now() + RESERVATION_TTL_SECONDS` (default 60).
- `purchase` moves a pending, unexpired reservation to `completed` and inserts one `Purchases` row.
- The sweeper moves due pending reservations to `expired` and returns their units to stock.

`completed` and `expired` are terminal. For every drop, at all times:

```
availableStock + count(pending) + count(completed) = totalStock
```

Every unit is on sale, held, or sold. Each transition changes the reservation status and the
counter in the same transaction, so the invariant holds at every commit. The integration tests
assert it after each scenario (`assertStockConserved`), and also that purchases equal completed
reservations.

## 2. Reserving

```sql
-- 1. Release the caller's own overdue hold on this drop, if the sweeper has not yet
UPDATE "Reservations"
SET status = 'expired', "updatedAt" = now()
WHERE user_id = :userId AND drop_id = :dropId
  AND status = 'pending' AND "expiresAt" <= now()
RETURNING id

-- 2. Take a unit; :released is the row count of step 1 (0 or 1)
UPDATE "Drops"
SET "availableStock" = "availableStock" + :released - 1, "updatedAt" = now()
WHERE id = :dropId AND "availableStock" + :released > 0
RETURNING id, "availableStock"
```

Zero rows returned by step 2 means sold out (or the drop does not exist; a second query
distinguishes the two). Otherwise the reservation row is inserted in the same transaction.
Step 1 is explained in section 7; without an overdue hold it matches nothing and `:released` is 0.

The previous code did `SELECT ... FOR UPDATE`, checked `availableStock` in the application, then
wrote the decremented value. Both approaches serialize concurrent reservers on the drop row. The
differences:

- Conditional UPDATE: one statement and one round trip. The row lock is taken when the statement
  runs and held until commit, so the hold window is the rest of a two-statement transaction. The
  decision ("is there stock") and the write are one atomic statement, so there is no
  read-modify-write in the application and nothing to forget. If someone drops the lock in a
  refactor, there is no lock to drop.
- `SELECT ... FOR UPDATE` then `UPDATE`: two round trips, and correct only if every code path
  remembers the lock. It stays the right tool when the decision depends on several reads or on
  application logic that cannot be written as one predicate.

Why the conditional UPDATE cannot oversell under READ COMMITTED (the Postgres default): when a
second UPDATE finds the row locked by an uncommitted one, it waits. After the first commits, the
second does not reuse its old snapshot of the row. Postgres re-fetches the latest row version and
re-evaluates the `WHERE` clause against it (the EvalPlanQual recheck). If `availableStock` is now
0, the row no longer matches and the statement updates nothing. This is what makes
`availableStock > 0` in the predicate safe, where a separate SELECT would have read a stale value.

Backstop: `CHECK ("availableStock" >= 0 AND "availableStock" <= "totalStock")`
(`drops_available_stock_range`). If any code path, now or later, tries to oversell or to
return a unit twice, the statement fails instead of corrupting the counter. A test updates stock
to -1 directly and expects the constraint to reject it.

## 3. Throughput

All reservations for one drop update the same row, so they run one at a time. The ceiling for a
single drop is about `1 / (time the row lock is held)`. The lock is held from the decrement until
commit, so that time is the remaining statement latency (the reservation INSERT, including the FK
checks and the unique-index probe) plus commit, dominated by the WAL fsync.

App-to-database round trips add to the hold time whenever the app pauses between taking the lock
and commit, which is why nothing runs between the decrement and the INSERT. Step 1 runs before
the Drops lock is taken, so it adds a round trip to each reservation but not to the hold time.
The measurements below predate step 1.
`SELECT ... FOR UPDATE` followed by a separate UPDATE adds one more round trip while the lock is
held. Different drops do not contend with each other.

Measured with `backend/scripts/bench-reserve.js` (one drop, 3000 reservations per run after 200
warm-up, each by a distinct user, pool of 64, C concurrent workers). It compares
`ReservationService.reserve` against a `SELECT "availableStock" ... FOR UPDATE` / UPDATE /
INSERT transaction, and checks `availableStock + pending = totalStock` after every run:

```bash
BENCH_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/sneaker-drop-test npm run bench:reserve
```

| strategy            | C  | ops/s     | p50 ms | p99 ms  |
| ------------------- | -- | --------- | ------ | ------- |
| conditional UPDATE  | 1  | 1190–1346 | 0.7    | 1.9–2.9 |
| conditional UPDATE  | 8  | 1480–1560 | 4.2    | 18–20   |
| conditional UPDATE  | 32 | 1199–1224 | 18–19  | 113–122 |
| conditional UPDATE  | 64 | 949–1027  | 41–43  | 303–375 |
| SELECT FOR UPDATE   | 1  | 1056–1154 | 0.8    | 2.1–2.2 |
| SELECT FOR UPDATE   | 8  | 1108–1186 | 2.6–2.9| 95–116  |
| SELECT FOR UPDATE   | 32 | 906–1018  | 22–23  | 141–177 |
| SELECT FOR UPDATE   | 64 | 676–848   | 50–60  | 360–464 |

Ranges are over three runs on an Apple M4, with Node 24 and Postgres 16 in Docker Desktop on the
same machine (default config, fsync on). The invariant held in every run for both strategies.

- Both strategies are correct. The difference is cost, not safety.
- The conditional UPDATE is 15–35% faster from C=8 up. At C=1 the two are within noise. Its
  tail is much shorter at moderate concurrency: p99 of about 19 ms against about 100 ms at C=8.
- Neither scales with concurrency. Throughput peaks around C=8 and falls after that, because
  every attempt queues on the same row lock. More workers add latency, not throughput.
- Run-to-run variance is about 15%, so treat smaller differences as noise. The absolute numbers
  are for a laptop with client and database on one machine. Slower storage, network latency to the
  database, or synchronous replication will lower them. The relative comparison is the useful part.

Pool size matters: `DB_POOL_MAX` (default 5, `backend/src/config/config.js`). Connections beyond
what the hot row can serve only queue on the lock while holding a pooled connection, which starves
other endpoints. Size the pool for total concurrent work, not for peak reservation attempts.

Mitigations if one drop ever becomes the bottleneck, roughly in order of cost:

1. Keep the transaction as short as it is now. Do not add reads, HTTP calls or emits between the
   UPDATE and commit.
2. Bucket the counter: split `availableStock` into N rows per drop and decrement a random bucket
   with the same conditional UPDATE, falling through to other buckets on zero. Contention drops
   by about N; the cost is more complex sold-out detection and reads that sum the buckets.
3. Put a queue or token system in front: admit only as many requests as there is stock, and let
   the database see only admitted ones.
4. Pre-generate one row per unit and claim one with
   `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1`, so concurrent claimers take different rows
   instead of queueing on one.

## 4. Purchase versus expiry

Both transitions leave `pending` through a conditional UPDATE on the reservation row.

Purchase:

```sql
UPDATE "Reservations"
SET status = 'completed', "updatedAt" = now()
WHERE id = :reservationId AND user_id = :userId
  AND status = 'pending' AND "expiresAt" > now()
RETURNING id, drop_id
```

Expiry (inside the sweeper's CTE):

```sql
UPDATE "Reservations" r
SET status = 'expired', "updatedAt" = now()
FROM due
WHERE r.id = due.id AND r.status = 'pending'
```

Whichever commits first wins. The other either waits on the row lock and then matches zero rows
(same EvalPlanQual recheck as in section 2), or, for the sweeper, skips the row (section 5). A
reservation is therefore purchased or expired, never both, and its unit is sold or returned to
stock exactly once.

The old bug: the expiry timer read the reservation without a lock and later wrote
`status = 'expired'` unconditionally. A purchase that committed between the read and the write was
overwritten, and the unit was added back to stock while a purchase row for it existed. That is a
sold unit offered for sale again. Nothing in the old write checked that the state it had read was
still current.

Purchase also checks `"expiresAt" > now()` in the same statement, so the deadline is enforced by
the purchase itself and does not depend on the sweeper having run. A due reservation that is still
`pending` cannot be bought; the call returns `409 RESERVATION_EXPIRED`.

## 5. Expiry

Expiry is a database sweep, not a per-reservation `setTimeout`. In-process timers were lost on
every restart (reservations stayed pending forever, holding stock) and cannot coordinate between
instances. `ExpiryService.start` sweeps once at startup, which recovers anything that expired
while the process was down, then every `EXPIRY_SWEEP_INTERVAL_MS` (default 5000). Sweeps within
one process never overlap.

Each sweep is one transaction and one statement chain: select due rows, mark them expired,
increment `availableStock` per drop by the number released, return the changed drops so the caller
can emit `stock_updated`.

- `pg_try_advisory_xact_lock(72001)`: single-flight across instances. A second sweeper gets
  `false` and returns immediately. Without it, two sweepers would update `Drops` rows in
  whatever order their batches hit them; with several drops that order can differ and deadlock.
  The lock is transaction-scoped, so it is released on commit, rollback or connection loss.
- `FOR UPDATE SKIP LOCKED` on the due reservations: a reservation locked by an in-flight purchase
  is skipped rather than waited on. If the purchase commits, the row is no longer pending and
  later sweeps ignore it. If it rolls back, the next sweep expires it. Plain `FOR UPDATE` would
  still be correct: after the wait, Postgres re-checks `status = 'pending'` on the committed row
  version (EvalPlanQual), finds it `completed`, and leaves it alone. What waiting costs is
  liveness. The sweeper stalls behind every in-flight purchase in its batch while holding the
  advisory lock, so no instance can expire anything until those purchases finish. Waiting becomes
  unsafe only if the status re-check is removed as well, which is the old timer bug (section 4).
- Batch of 500 (`LIMIT`) ordered by `expiresAt`, looping inside `start` while a sweep comes back
  full, so a large backlog (for example after downtime) is drained in bounded transactions.
- Partial index for the scan, so the cost follows the number of pending rows, not the table size:

```sql
CREATE INDEX "reservations_pending_expires_at"
ON "Reservations" ("expiresAt") WHERE status = 'pending'
```

Latency: a reservation can remain `pending` up to one sweep interval past `expiresAt`
(5 s by default), so its unit returns to stock that much later than the deadline. During that
window it cannot be purchased (section 4). The cost of the lag is only that stock appears later;
it is never oversold or double-counted. The one exception is the holder: if they reserve the same
drop again in that window, `reserve` releases the hold itself (section 7).

## 6. Idempotency of purchase

`Purchases.reservation_id` is a foreign key with a unique index (`purchases_reservation_id_key`).
Existing purchases made before the migration keep NULL there; NULLs do not conflict.

- Retry after success: the claim UPDATE matches no row (status is `completed`), so
  `explainUnclaimed` looks up the purchase by reservation and user and returns it with
  `created = false`. The controller answers `200` with `replayed: true`.
- Concurrent retries: the later UPDATEs block on the row lock held by the first. After it commits
  they re-evaluate, match nothing, and their follow-up lookup sees the committed purchase. One row
  is created, every caller receives the same purchase id.
- If a purchase row exists for a reservation that was still pending, the INSERT hits the unique
  index and the call fails with `409 PURCHASE_CONFLICT` instead of guessing. This can only come
  from data written outside the service; the unique index is the guarantee if the code is bypassed.

A user cannot purchase another user's reservation: `user_id` is part of the claim predicate and
the miss is reported as `404 RESERVATION_NOT_FOUND`.

## 7. One pending reservation per user per drop

```sql
CREATE UNIQUE INDEX "reservations_one_pending_per_user_drop"
ON "Reservations" (user_id, drop_id) WHERE status = 'pending'
```

Partial, so a user can reserve the same drop again after an earlier reservation completed or
expired. The decrement runs before the INSERT; if the INSERT hits this index the whole
transaction rolls back, which also undoes the decrement, and the caller gets
`409 ALREADY_RESERVED`. Ten concurrent attempts by one user yield one reservation and nine
rejections with stock reduced by exactly one.

A hold that is past `expiresAt` but not yet swept is still `pending`, so it still occupies the
index. `reserve` therefore expires the caller's own overdue hold on the drop first (step 1 in
section 2) and adds its unit back in the same Drops UPDATE, a net stock change of 0. Without it
there were two problems:

- Re-reserving right after the deadline returned `409 ALREADY_RESERVED` (or `SOLD_OUT`, if that
  hold was the last unit) for up to one sweep interval.
- Deadlock with the sweeper. The sweeper locks the reservation row, then the Drops row. The old
  `reserve` locked the Drops row first, then its INSERT probed the unique index and found the
  entry of the row the sweeper was expiring, so it waited for the sweeper's transaction while the
  sweeper waited for Drops. Postgres aborted one side after `deadlock_timeout` (1 s); seen as a
  500 from `reserve` or a failed sweep, depending on which side it picked.

Step 1 runs before the Drops UPDATE, so `reserve` takes locks in the sweeper's order:
reservation, then drop. If a sweep holds the overdue row, step 1 waits for it, then re-checks
`status = 'pending'` on the committed version, matches nothing, and step 2 sees the unit the
sweep returned. If `reserve` holds the row first, the sweep skips it (`SKIP LOCKED`). Either way
the unit is released once. Step 1 only touches the caller's own reservation for this drop, and
only once it is overdue; a live hold is untouched and the INSERT still answers
`ALREADY_RESERVED`.

Older code allowed several pending reservations per user and drop, so the migration cannot just
create the index. Before creating it, it ranks pending reservations per `(user_id, drop_id)` by
`id DESC`, keeps the newest, marks the rest `expired`, and adds the released count back to each
drop's `availableStock`, all in one statement so the stock invariant is preserved. The same
migration makes `status`, `user_id` and `drop_id` NOT NULL on `Reservations` and adds the CHECK on
`Drops` described in section 2. The whole migration runs in one transaction.

## 8. Known limits

- No authentication. `userId` comes from the request body, so any client can act as any user.
  This is a demo; the "user cannot buy someone else's reservation" check protects against mistakes
  by honest clients, not against an attacker.
- Throughput per drop is bounded by the hot row: about 1000–1500 reservations per second on a
  laptop, peaking near 8 concurrent writers (section 3).
- Stock returns up to one sweep interval after the deadline (section 5), except to the holder
  re-reserving the same drop (section 7).
- Time comes from the database clock (`now()`), so app instances need not agree on time.

Tests: `backend/test/reservations.test.js`, run with `npm run test:db` against a real Postgres
whose name ends in `-test` (the suite drops and recreates the schema, so it refuses anything
else). CI runs it. Each test forces one guarantee:

- 40 concurrent reservers for 10 units: exactly 10 succeed, 30 get `SOLD_OUT`, stock is 0.
- One user with 10 concurrent attempts: one reservation, nine `ALREADY_RESERVED`, units returned.
- Reserving again after expiry works. Reserving again while the hold is live is
  `ALREADY_RESERVED` and keeps the hold. Reserving again after the deadline but before any sweep
  works even when that hold was the last unit, and leaves nothing for the sweeper.
- Re-reserve versus sweep, both orders forced with lock waiters: with reserve queued first on the
  Drops row (held by a third transaction) the sweep skips the row and neither side is aborted
  (the old code deadlocked here); with the sweep holding the expired row, reserve waits for it and
  then takes the returned unit instead of answering `SOLD_OUT`.
- Unknown drop and unknown user return 404 codes and leave stock unchanged.
- The CHECK constraint rejects `availableStock = -1`.
- 10 concurrent purchases of one reservation: one purchase row, one `created`, same id for all.
- Retried purchase returns the original; another user's reservation is `RESERVATION_NOT_FOUND`.
- Purchase after `expiresAt` but before the sweeper is refused and the reservation stays pending
  until the sweep, which returns the unit once.
- Expiry-first race: a held sweep transaction, a purchase proven queued via `pg_stat_activity`
  lock waiters, then commit; the purchase is refused and stock returns once.
- Purchase-first race: a held purchase transaction; the sweep returns without waiting and returns
  nothing; the sold unit is not restored. A rolled-back purchase leaves the reservation to the
  next sweep.
- Stress: 60 users and 30 units over five rounds with purchases (some duplicated) racing five
  parallel sweeps; the invariant holds after each round and no reservation is left pending.
- Single-flight sweeper: a second sweep backs off while the first is open even though unlocked
  due rows exist.
- Reservations that expired during simulated downtime are released by the startup sweep, with one
  `stock_updated` event.

`backend/scripts/mutation-check.js` checks that the tests catch each bug. It reintroduces one bug at
a time into the service source, runs the suite, records which tests fail, and always restores the
file. It exits non-zero if any mutation survives:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/sneaker-drop-test npm run test:mutation
```

Result (about 13 s, no survivors):

| mutation                                    | kind     | caught by                                                                                  |
| ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| purchase drops `status = 'pending'`         | safety   | 3 to 5 tests by run: concurrent purchases, retry, expiry-first race always; another user's reservation and purchase past the deadline in some runs |
| purchase drops the `expiresAt` check        | safety   | purchase past the deadline is refused                                                      |
| sweeper drops `status = 'pending'` (old bug) | safety  | purchase-first race (sold unit returned to stock), stress, single-flight (stock CHECK violated) |
| reserve drops `availableStock > 0`          | safety   | concurrent reservations: the CHECK constraint still blocks the oversell, but losers get a raw error instead of `SOLD_OUT` |
| sweeper uses `FOR UPDATE` without `SKIP LOCKED` | liveness | purchase-first and rollback races: the sweep blocks on the purchase instead of skipping it; re-reserve versus sweep: the sweep queues behind reserve |
| advisory lock is a no-op                    | liveness | single-flight: the second sweeper queues on the `Drops` row instead of backing off        |
| reserve leaves an overdue own hold to the sweeper | safety | all three re-reserve-after-deadline tests (`SOLD_OUT`, deadlock, reserve not waiting for the sweep) |
| reserve expires its own hold before the deadline | safety | reserving again while the hold is live                                                    |

The two liveness rows leave the data correct. With `SKIP LOCKED` removed, the purchase-first test
passes every data assertion (reservation `completed`, stock 0, invariant holds). It fails only
the check that the sweep did not wait (section 5). Without the advisory lock, a second sweeper
waits rather than corrupting anything. The risk there is deadlock between sweepers on several
drops, which this single-drop test does not reproduce.
