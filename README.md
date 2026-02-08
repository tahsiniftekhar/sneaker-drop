# Sneaker Drop System - Quick Start Guide

A real-time high-traffic inventory system for limited-edition sneaker drops with atomic reservations, real-time stock updates, and concurrent user handling.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL (or Neon for serverless)
- npm

### Setup

**1. Backend Setup**

```bash
cd backend
npm install
cp .env.example .env  # Configure DATABASE_URL
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all
npm run dev
```

**2. Frontend Setup** (in another terminal)

```bash
cd frontend
npm install
npm run dev
```

**3. Access the App**

- Frontend: `http://localhost:5173`
- API: `http://localhost:5001/api`
- Socket.io: `http://localhost:5001`

---

## 🧪 Testing

### Run All Tests

```bash
cd backend
bash run-tests.sh
```

Or individually:

```bash
# Test atomic reservations (race condition prevention)
npm run test:atomic

# Test end-to-end flow (reserve → purchase → verify)
npm run test:e2e

# Run both
npm run test
```

### Full Test Documentation

See [TEST_GUIDE.md](TEST_GUIDE.md) for detailed test explanations and troubleshooting.

---

## ✨ Key Features Verified

| Feature                 | Status | Test                                        |
| ----------------------- | ------ | ------------------------------------------- |
| Real-time stock updates | ✅     | E2E test verifies WebSocket broadcasts      |
| Atomic reservations     | ✅     | 100 concurrent users → 1 succeeds           |
| Prevent overselling     | ✅     | Transaction locks prevent race conditions   |
| 60-second expiry        | ✅     | Reservation timer and automatic return      |
| Purchase flow           | ✅     | Can only purchase reserved items            |
| Activity feed           | ✅     | Top 3 recent buyers per drop                |
| UI feedback             | ✅     | Loading states, toast notifications, timers |

---

## 📊 Architecture

### Concurrency Handling

**Atomic Reservation** uses Sequelize transactions with pessimistic locking:

```javascript
const drop = await Drop.findByPk(dropId, {
  lock: transaction.LOCK.UPDATE, // ← Prevents race condition
});
drop.availableStock -= 1;
await drop.save({ transaction });
```

This ensures that even if 100 users click "Reserve" simultaneously:

- Only 1 succeeds
- 99 get "Item out of stock" error
- Stock never goes negative

### Real-Time Updates

**Socket.io** broadcasts stock changes to all connected clients:

```javascript
io.emit('stock_updated', {
  dropId: dropId,
  availableStock: drop.availableStock,
  purchases: recentPurchases, // Activity feed
});
```

Frontend listens and updates UI instantly:

```typescript
socket.on('stock_updated', (data: StockUpdate) => {
  setDrops((currentDrops) =>
    currentDrops.map((d) =>
      d.id === data.dropId ? { ...d, availableStock: data.availableStock } : d
    )
  );
});
```

### Stock Recovery

If a user doesn't complete purchase within 60 seconds:

```javascript
static startRecoveryTimer(reservationId, dropId, io) {
  setTimeout(async () => {
    // Mark as expired, return stock
    reservation.status = 'expired';
    drop.availableStock += 1;
    // Broadcast update
    io.emit('stock_updated', { ... });
  }, 60000);
}
```

---

## 🎯 Testing Guide

### Scenario 1: Race Condition Prevention

Run the atomic test:

```bash
npm run test:atomic
```

Expected: Only 1 reservation succeeds out of 100 concurrent attempts.

### Scenario 2: Real-Time Stock Sync

Open **two browser windows** side-by-side:

1. **Window A**: Click "Reserve"
2. **Window B**: Watch stock decrement instantly
3. **Window A**: Click "Complete Purchase"
4. **Window B**: See activity feed update

### Scenario 3: 60-Second Expiry

1. Click "Reserve"
2. Wait 60 seconds
3. See countdown timer hit 0
4. Verify stock returned in another window

---

## 🔧 API Endpoints

### Drops

- `GET /api/drops` - List all drops with activity feed
- `POST /api/drops` - Create new drop (admin)

### Reservations

- `POST /api/reservations` - Create reservation (decrements stock)
  ```json
  { "userId": 1, "dropId": 1 }
  ```

### Purchases

- `POST /api/purchases/complete` - Complete purchase
  ```json
  { "userId": 1, "reservationId": 5 }
  ```

### Users

- `GET /api/users` - List all users

---

## 📝 Database Schema

```sql
-- Users
CREATE TABLE Users (
  id SERIAL PRIMARY KEY,
  username VARCHAR UNIQUE NOT NULL,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);

-- Drops
CREATE TABLE Drops (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  totalStock INTEGER NOT NULL,
  availableStock INTEGER NOT NULL,
  startsAt TIMESTAMP,
  endsAt TIMESTAMP,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);

-- Reservations (60-second window)
CREATE TABLE Reservations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES Users,
  drop_id INTEGER REFERENCES Drops,
  status ENUM('pending', 'completed', 'expired'),
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);

-- Purchases (permanent)
CREATE TABLE Purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES Users,
  drop_id INTEGER REFERENCES Drops,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

---

## 🚀 Deployment

### Frontend (Vercel)

```bash
cd frontend
npm run build
vercel deploy
```

### Backend (Vercel)

```bash
cd backend
# Ensure entry point is server.js
vercel deploy
# Set DATABASE_URL in Vercel environment
```

### Database (Neon)

1. Create account at [neon.tech](https://neon.tech)
2. Create project
3. Copy connection string to `DATABASE_URL`
4. Run migrations in production:
   ```bash
   NODE_ENV=production npx sequelize-cli db:migrate
   ```

---

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Kill process on port 5001
lsof -ti:5001 | xargs kill -9
npm run dev
```

### Database Connection Error

Check `.env` file:

```bash
cat .env
# DATABASE_URL should start with postgresql://
```

### WebSocket Connection Refused

Ensure backend is running:

```bash
# In another terminal
npm run dev
```

### Tests Fail: "User Not Found"

Re-seed the database:

```bash
npx sequelize-cli db:seed:all
```

---

## 📚 Documentation

- [TEST_GUIDE.md](TEST_GUIDE.md) - Detailed test documentation
- [backend/README.md](backend/README.md) - Backend architecture
- [frontend/README.md](frontend/README.md) - Frontend guide

---

## 📄 License

MIT
