# Test Suite Documentation

## Overview

This project includes two comprehensive test suites to verify the critical functionality of the sneaker drop system:

1. **Atomic Reservation Test** - Verifies race condition prevention
2. **End-to-End Flow Test** - Verifies the complete user journey

---

## Prerequisites

Before running tests, ensure:

```bash
# 1. Backend dependencies installed
cd backend
npm install

# 2. Backend server running (in a separate terminal)
npm run dev

# 3. Database migrations done
npx sequelize-cli db:migrate

# 4. Seed data exists (optional but recommended)
npx sequelize-cli db:seed:all
```

---

## Test 1: Atomic Reservation Test

### What It Tests

This test verifies that the reservation system prevents **race conditions** and **overselling**.

**Scenario**: 100 concurrent users try to reserve the last remaining item (stock = 1) at the exact same millisecond.

**Expected Result**: Only 1 reservation succeeds. All other 99 fail with "Item out of stock."

### Why It Matters

This proves that the Sequelize transaction with `LOCK.UPDATE` is working correctly to prevent concurrent access to the drop record. Without this lock, multiple users could reserve the same items beyond available stock.

### How to Run

```bash
# From backend directory
npm run test:atomic

# Or directly
node test-atomic-reservation.js
```

### Expected Output

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                 ATOMIC RESERVATION TEST SUITE                             ║
║                                                                           ║
║  Testing: 100 concurrent users reserving 1 item           ║
║  Expected: Only 1 succeeds                                                ║
╚═══════════════════════════════════════════════════════════════════════════╝

🔧 Setting up test environment...

✅ Database synced
✅ Cleaned up old test drop
✅ Created test drop (ID: 1, Stock: 1)
✅ Using existing users

🚀 Simulating 100 concurrent reservation attempts...

⏱️  Completed 100 requests in 245ms

================================================================================
RESULTS
================================================================================

📊 Atomicity Check:
   ✅ Successful Reservations: 1
   ❌ Failed Reservations: 99

✅ ATOMIC RESERVATION VERIFIED!
   Only 1 user out of 100 succeeded.
   Race condition prevention is working correctly.

   Winner: User ID 42 (Reservation ID: 15)

Verifying stock count in database...
   Available Stock: 0/1
   ✅ Stock correctly decremented to 0

================================================================================
✅ ALL TESTS PASSED - Atomic reservations are working correctly!
================================================================================
```

### What Each Section Means

| Section                            | Meaning                          |
| ---------------------------------- | -------------------------------- |
| `Successful Reservations: 1`       | Good! Only one user got the item |
| `Failed Reservations: 99`          | Good! Others were blocked        |
| `Stock correctly decremented to 0` | Good! No double-booking          |

---

## Test 2: End-to-End Flow Test

### What It Tests

This test verifies the **complete user journey** through the app:

1. ✅ Fetch available drops with activity feed
2. ✅ Create a reservation (stock decrements)
3. ✅ Receive real-time stock update via WebSocket
4. ✅ Complete purchase
5. ✅ Verify activity feed updated with new buyer

### Why It Matters

This proves that:

- Dashboard works correctly
- Real-time updates broadcast to all clients via WebSocket
- Purchase successfully decrements stock
- Activity feed shows recent buyers

### How to Run

```bash
# From backend directory
npm run test:e2e

# Or directly
node test-e2e.js
```

### Expected Output

```
╔═══════════════════════════════════════════════════════════════════════════╗
║              END-TO-END RESERVATION & PURCHASE TEST                       ║
║                                                                           ║
║  Journey: Fetch Drops → Reserve → Purchase → Verify                      ║
╚═══════════════════════════════════════════════════════════════════════════╝

🔧 Setting up test environment...

✅ Created test user: e2e-test-user-1707407625000
✅ Created test drop: E2E Test Drop (Stock: 10)

🔗 Connecting to WebSocket for real-time updates...
✅ Connected to WebSocket

📋 Test 1: Fetch available drops
   ✅ Fetched 6 drops
   ✅ Found test drop: E2E Test Drop
   ✅ Stock: 10/10

🎫 Test 2: Create reservation
   ✅ Reservation created
   ✅ Reservation ID: 5
   ✅ Status: pending
   ✅ Expires at: 2/8/2026, 3:47:05 PM

📡 Test 3: Verify real-time stock update via WebSocket
   ✅ Stock update received
   ✅ Stock: 9/10
   ✅ Activity feed updated (0 recent buyers)

💳 Test 4: Complete purchase
   ✅ Purchase completed
   ✅ Purchase ID: 3
   ✅ Drop ID: 1

🔍 Test 5: Verify final state
   ✅ Drop retrieved: E2E Test Drop
   ✅ Final stock: 9/10
   ✅ Activity feed shows 1 recent buyer(s)
      1. e2e-test-user-1707407625000

================================================================================
✅ ALL TESTS PASSED!
================================================================================

Full flow working correctly:
  ✓ Dashboard fetches drops with activity feed
  ✓ Reservation decrements stock
  ✓ Stock updates broadcast to all clients
  ✓ Purchase completes successfully
  ✓ Activity feed reflects new purchase
```

---

## Running Both Tests

```bash
# Run all tests sequentially
npm test
```

This is a good CI/CD check before deployment.

---

## Troubleshooting

### Test Fails: "Connection refused"

**Issue**: Backend server not running

**Fix**:

```bash
# In one terminal
npm run dev

# In another terminal
npm run test:atomic
```

### Test Fails: "listen EADDRINUSE"

**Issue**: Port 5001 already in use

**Fix**:

```bash
# Kill process on port 5001
lsof -ti:5001 | xargs kill -9

# Try again
npm run dev
```

### Test Fails: "Database connection timeout"

**Issue**: DATABASE_URL environment variable not set or invalid

**Fix**:

```bash
# Check .env file exists in backend directory
cat .env

# Verify DATABASE_URL is set
echo $DATABASE_URL
```

### Test Fails: "Reservation invalid, expired..."

**Issue**: Test user or drop doesn't exist in database

**Fix**:

```bash
# Re-run migrations and seeders
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:all

# Try test again
npm run test:atomic
```

---

## Reading the Results

### Success Indicators

✅ **Atomic Test**:

- `Successful Reservations: 1`
- `Failed Reservations: 99`
- `Stock correctly decremented`

✅ **E2E Test**:

- All 5 tests pass
- Stock updates received via WebSocket
- Activity feed shows recent buyer

### Failure Indicators

❌ **More than 1 successful reservation** = Race condition not prevented
❌ **WebSocket update not received** = Socket.io broadcasting issue
❌ **Stock not decremented** = Transaction not committing

---

## How These Tests Prove the Requirements

| Requirement         | Test Verification                         |
| ------------------- | ----------------------------------------- |
| Atomic Reservation  | 100 concurrent attempts → only 1 succeeds |
| Prevent Overselling | Stock never goes negative                 |
| 60-Second Expiry    | Reservation has expiresAt timestamp       |
| Real-Time Updates   | WebSocket broadcasts stock changes        |
| Purchase Flow       | Can only purchase with valid reservation  |
| Activity Feed       | Top 3 buyers shown on drop card           |

---

## Next Steps

After tests pass, you're ready to:

1. **Test manually** in two browser windows side-by-side (recommended for demo)
2. **Deploy** to Vercel + Neon (see deployment guide)
3. **Monitor** production for concurrency edge cases

For a 2-minute demo video, open two browsers and:

1. Fetch drops in both
2. Click "Reserve" in one browser
3. Watch stock update in real-time in the other
4. Complete purchase in first browser
5. See activity feed update in both
