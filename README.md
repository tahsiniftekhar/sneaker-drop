# Sneaker Drop

A small inventory system for limited-edition sneaker drops. A user reserves one unit of a drop, which holds it for a short time, and then completes the purchase before the hold expires. Stock changes are pushed to every connected client over Socket.io. Reservations are safe under concurrent requests: stock is never oversold, and a reservation is either purchased or expired, never both.

## Demo only: no authentication

There is no authentication or authorization. The API takes `userId` from the request body and trusts it, so anyone who can reach the API can act as any user. Do not use this as-is for anything that needs real accounts.

## Stack

- Backend: Node.js 22, Express 5, Sequelize 6, PostgreSQL, Socket.io
- Frontend: React, TypeScript, Vite, Tailwind CSS
- Deployment: Docker image published to GHCR

## Local setup

Requirements: Node.js 22 or newer (the Docker image and CI use 22; `npm run test:db` uses test-runner flags such as `--test-timeout` that Node 18 and early Node 20 reject), PostgreSQL, npm.

Backend:

```bash
cd backend
npm install
cp .env.example .env        # set DATABASE_URL
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
npm run dev
```

Frontend, in another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173. API: http://localhost:5000/api. Socket.io: http://localhost:5000.

### Backend environment variables

Set in `backend/.env` (see `backend/.env.example`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | Listen port |
| `NODE_ENV` | `development` | Environment name |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed Socket.io (CORS) origin |
| `DATABASE_URL` | none (required) | Postgres connection string |
| `DB_SSL` | `false` | `true` to connect with TLS (for example Neon). Leave unset for Postgres on a private network |
| `DB_POOL_MAX` | `5` | Maximum connections in the pool |
| `RESERVATION_TTL_SECONDS` | `60` | How long a reservation holds a unit |
| `EXPIRY_SWEEP_INTERVAL_MS` | `5000` | How often the expiry sweeper runs |
| `DEMO_RESET_ALLOWED` | unset | Must be `true` for `npm run db:reset-demo` to run (see Deployment) |
| `MIGRATE_ON_START` | unset | Docker only: `true` runs migrations before the server starts |

### Frontend environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:5000/api` | REST API base URL |
| `VITE_SOCKET_URL` | `http://localhost:5000` | Socket.io server URL |

## API

Base path `/api`. Bodies are JSON. Ids must be positive integers.

### `GET /api/drops`

Returns all drops, each with its three most recent purchases (`Purchases`, each including `User` with `id` and `username`).

### `POST /api/drops`

Creates a drop. Body: `{ "name": "Air Example", "price": 199.99, "total_stock": 10 }`. Returns `201` with the drop; `400` with `{ "message": ... }` if a field is missing.

### `GET /api/users`

Returns `{ "success": true, "count": n, "data": [{ "id", "username", "createdAt" }] }`.

### `POST /api/reservations`

Reserves one unit and holds it until `expiresAt`.

```json
{ "userId": 1, "dropId": 1 }
```

`201` returns the reservation (`id`, `user_id`, `drop_id`, `status: "pending"`, `expiresAt`, timestamps).

### `POST /api/purchases/complete`

Turns a pending, unexpired reservation into a purchase.

```json
{ "userId": 1, "reservationId": 5 }
```

`201` returns `{ "message": "Purchase successful!", "purchase": { ... } }`. The call is idempotent: repeating it for an already purchased reservation returns `200` with `{ "message": "Purchase already completed.", "purchase": { ... }, "replayed": true }`.

### `GET /health`

Returns `200` `{"status":"ok","database":"up"}`, or `503` when the database is unreachable. `GET /api/health` is a simple liveness response that does not touch the database.

### Errors

Client errors from the reservation and purchase endpoints have the shape `{ "message": "...", "code": "..." }`.

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | A required id is missing or not a positive integer |
| 404 | `DROP_NOT_FOUND` | No such drop |
| 404 | `USER_NOT_FOUND` | No such user |
| 404 | `RESERVATION_NOT_FOUND` | No such reservation for this user |
| 409 | `SOLD_OUT` | No stock left |
| 409 | `ALREADY_RESERVED` | The user already holds a pending reservation for this drop |
| 409 | `RESERVATION_EXPIRED` | The reservation expired before purchase |
| 409 | `PURCHASE_CONFLICT` | The reservation already has a purchase but was still pending (data written outside the service) |

Unexpected errors return `500` with `{ "success": false, "message": "Internal Server Error" }`.

### Socket.io

The server emits `stock_updated` with `{ dropId, availableStock, triggeredByUserId?, purchases? }` after a reservation, a purchase, or an expiry.

## How reservations work

A reservation takes one unit of stock with a single conditional update, so concurrent requests cannot oversell, and holds it for `RESERVATION_TTL_SECONDS`. A user can hold one pending reservation per drop. Expiry is done by a database sweeper that runs at startup and every `EXPIRY_SWEEP_INTERVAL_MS`, not by in-memory timers, so a restart loses nothing. Purchase and expiry both leave `pending` through a conditional `UPDATE ... WHERE status = 'pending'`, so exactly one of them wins. See [docs/reservations.md](docs/reservations.md) for the full lifecycle and the invariants.

## Testing

Run these from `backend/`.

Integration tests for the reservation lifecycle run against a real Postgres database. The database name must end in `-test`; the tests refuse to run otherwise.

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/sneaker-drop-test npm run test:db
```

Against the same kind of `-test` database, `npm run test:mutation` reintroduces past bugs one at a time and checks that the suite catches each, and `npm run bench:reserve` (with `BENCH_DATABASE_URL`) measures reservation throughput. Results and how to read them are in [docs/reservations.md](docs/reservations.md).

Unit tests for the demo-reset guard need no database:

```bash
npm run test:guard
```

Both run in CI (`.github/workflows/test.yml`) on pushes to `develop` and on pull requests.

There are also two scripts that run against a live backend, which must be running on port 5000 with migrated and seeded data (`npm run dev` in another terminal):

```bash
npm run test:atomic   # many concurrent reservations for a single unit: exactly one succeeds
npm run test:e2e      # fetch drops, reserve, receive the stock_updated event, purchase, check the activity feed
npm test              # both
bash run-tests.sh     # checks the environment, migrates, starts the server, runs both, stops it
```

Troubleshooting: "connection refused" means the backend is not running; "user not found" or "drop not found" usually means the database needs `npx sequelize-cli db:seed:all`; if port 5000 is taken (on macOS the AirPlay Receiver uses it), stop the other process or set `PORT` and point `VITE_API_URL` / `VITE_SOCKET_URL` at the new port.

Manual check: open the frontend in two browser windows, reserve in one and watch the stock change in the other, then complete the purchase and watch the activity feed update.

## Deployment

### Backend (Docker)

The backend is deployed as a Docker image, run behind a reverse proxy.

Image: `ghcr.io/tahsiniftekhar/sneaker-drop-api` (tags `latest`, `sha-<short>`), built by `.github/workflows/docker-image.yml` on every push to `develop`. Never build it on the server.

Container environment variables:

| Env var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (required) |
| `DB_SSL` | `true` to use TLS (Neon). Unset or `false` for Postgres on a private network |
| `PORT` | Listen port (default `5000`) |
| `FRONTEND_URL` | Allowed Socket.io origin (the frontend's URL) |
| `MIGRATE_ON_START` | `true` to run migrations before starting (default: off) |

The reservation and pool settings from the table above (`RESERVATION_TTL_SECONDS`, `EXPIRY_SWEEP_INTERVAL_MS`, `DB_POOL_MAX`) apply to the container too.

The image runs as a non-root user, logs to stdout, sets `NODE_OPTIONS=--max-old-space-size=128` and is sized for a container limit of 192 MB / 0.5 CPU. `GET /health` returns `200` `{"status":"ok","database":"up"}` (or `503` when the DB is unreachable); the app trusts 2 proxy hops (Cloudflare then Caddy).

Container commands (first argument of the entrypoint):

```bash
docker run --rm --env-file .env ghcr.io/tahsiniftekhar/sneaker-drop-api migrate   # sequelize-cli db:migrate
docker run --rm --env-file .env ghcr.io/tahsiniftekhar/sneaker-drop-api reset     # drop schema, migrate, seed
docker run -d --env-file .env --memory=192m --cpus=0.5 ghcr.io/tahsiniftekhar/sneaker-drop-api  # start (default)
```

Nightly demo reset: schedule the `reset` command (for example with cron). It destroys all data in the target database and re-seeds it, and is safe to run repeatedly. Locally: `npm run db:reset-demo`. It refuses to start (exit 1, nothing touched) unless `DEMO_RESET_ALLOWED=true` is set and `DATABASE_URL` names the database `sneaker-drop`; `reset --check` runs only that guard (`npm run test:guard` tests it). Cron example: `docker compose run --rm -e DEMO_RESET_ALLOWED=true sneaker-drop-api reset`. Demo data is reset and re-seeded nightly.

### Frontend

The frontend is a static Vite build and can be hosted anywhere static files are served:

```bash
cd frontend
VITE_API_URL=https://api.example.com/api VITE_SOCKET_URL=https://api.example.com npm run build
```

Upload `frontend/dist`. Set the backend's `FRONTEND_URL` to the origin the frontend is served from.

### Database

Any PostgreSQL works. For a TLS-only provider such as Neon, set `DB_SSL=true`. Run migrations with the container `migrate` command, or `DB_SSL=true NODE_ENV=production npx sequelize-cli db:migrate`.

## Branches

`develop` is the default branch and the only long-lived branch. There is no `main` or `master`. Work happens on short-lived branches merged into `develop`.

## License

MIT
