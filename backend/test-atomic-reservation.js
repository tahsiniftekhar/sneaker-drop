/**
 * Atomic Reservation Test Script
 *
 * This script tests the race condition prevention in the reservation system.
 * It simulates 100 concurrent users trying to reserve the last item (stock = 1).
 *
 * Expected Result: Only 1 reservation succeeds, rest fail with "out of stock"
 * This proves the LOCK.UPDATE transaction is working correctly.
 */

const axios = require('axios');
const sequelize = require('./src/config/database');
const { User, Drop } = require('./src/models/index');

const API_URL = 'http://localhost:5001/api';

// ============================================
// Test Configuration
// ============================================
const NUM_CONCURRENT_USERS = 100;
const TEST_DROP_NAME = 'Atomic Test Drop';
const CONCURRENT_STOCK = 1;

// ============================================
// Helper Functions
// ============================================

async function setupTestEnvironment() {
  console.log('🔧 Setting up test environment...\n');

  try {
    // Sync database
    await sequelize.sync({ alter: true });
    console.log('✅ Database synced');

    // Clear old test data
    await Drop.destroy({ where: { name: TEST_DROP_NAME } });
    console.log('✅ Cleaned up old test drop');

    // Create test drop with minimal stock
    const testDrop = await Drop.create({
      name: TEST_DROP_NAME,
      price: 99.99,
      totalStock: CONCURRENT_STOCK,
      availableStock: CONCURRENT_STOCK,
      startsAt: null,
      endsAt: null,
    });
    console.log(`✅ Created test drop (ID: ${testDrop.id}, Stock: ${testDrop.availableStock})\n`);

    // Get or create test users
    const users = await User.findAll({ limit: NUM_CONCURRENT_USERS });

    if (users.length < NUM_CONCURRENT_USERS) {
      console.log(
        `⚠️  Only ${users.length} users available. Creating ${NUM_CONCURRENT_USERS - users.length} more...`
      );
      const newUsers = await Promise.all(
        Array.from({ length: NUM_CONCURRENT_USERS - users.length }, (_, i) =>
          User.create({ username: `test-user-${Date.now()}-${i}` })
        )
      );
      users.push(...newUsers);
      console.log(`✅ Created additional test users\n`);
    }

    return { testDrop, users: users.slice(0, NUM_CONCURRENT_USERS) };
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

async function simulateConcurrentReservations(dropId, users) {
  console.log(`🚀 Simulating ${NUM_CONCURRENT_USERS} concurrent reservation attempts...\n`);

  const startTime = Date.now();

  // Create all requests to fire at the same time
  const reservationPromises = users.map((user) =>
    axios
      .post(`${API_URL}/reservations`, {
        userId: user.id,
        dropId: dropId,
      })
      .then((res) => ({
        status: 'SUCCESS',
        userId: user.id,
        reservationId: res.data.id,
        message: `User ${user.id} reserved successfully`,
      }))
      .catch((err) => ({
        status: 'FAILED',
        userId: user.id,
        message: `User ${user.id}: ${err.response?.data?.message || err.message}`,
      }))
  );

  // Execute all requests concurrently
  const results = await Promise.all(reservationPromises);
  const duration = Date.now() - startTime;

  return { results, duration };
}

function analyzeResults(results, duration) {
  console.log(`\n⏱️  Completed ${NUM_CONCURRENT_USERS} requests in ${duration}ms\n`);
  console.log('='.repeat(80));
  console.log('RESULTS');
  console.log('='.repeat(80));

  const successCount = results.filter((r) => r.status === 'SUCCESS').length;
  const failureCount = results.filter((r) => r.status === 'FAILED').length;

  console.log(`\n📊 Atomicity Check:`);
  console.log(`   ✅ Successful Reservations: ${successCount}`);
  console.log(`   ❌ Failed Reservations: ${failureCount}`);

  if (successCount === 1) {
    console.log(`\n✅ ATOMIC RESERVATION VERIFIED!`);
    console.log(`   Only 1 user out of ${NUM_CONCURRENT_USERS} succeeded.`);
    console.log(`   Race condition prevention is working correctly.\n`);

    const winner = results.find((r) => r.status === 'SUCCESS');
    console.log(`   Winner: User ID ${winner.userId} (Reservation ID: ${winner.reservationId})`);
    return true;
  } else if (successCount === 0) {
    console.log(`\n❌ ATOMIC RESERVATION FAILED!`);
    console.log(`   All ${NUM_CONCURRENT_USERS} users failed to reserve.`);
    console.log(`   This might indicate a database connectivity issue.\n`);
    return false;
  } else {
    console.log(`\n🚨 ATOMIC RESERVATION BROKEN!`);
    console.log(`   ${successCount} users succeeded (expected only 1).`);
    console.log(`   Race condition is NOT prevented!\n`);
    return false;
  }
}

async function verifyStockDecrement() {
  console.log(`\nVerifying stock count in database...`);
  try {
    const drop = await Drop.findOne({ where: { name: TEST_DROP_NAME } });
    console.log(`   Available Stock: ${drop.availableStock}/${drop.totalStock}`);

    if (drop.availableStock === CONCURRENT_STOCK - 1) {
      console.log(`   ✅ Stock correctly decremented to ${drop.availableStock}`);
      return true;
    } else {
      console.log(
        `   ❌ Stock incorrect! Expected ${CONCURRENT_STOCK - 1}, got ${drop.availableStock}`
      );
      return false;
    }
  } catch (error) {
    console.error(`   ❌ Failed to verify stock:`, error.message);
    return false;
  }
}

// ============================================
// Main Test Runner
// ============================================

async function runTests() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║                 ATOMIC RESERVATION TEST SUITE                             ║');
  console.log('║                                                                           ║');
  console.log(`║  Testing: ${NUM_CONCURRENT_USERS} concurrent users reserving 1 item           ║`);
  console.log('║  Expected: Only 1 succeeds                                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  try {
    // Step 1: Setup
    const { testDrop, users } = await setupTestEnvironment();

    // Step 2: Run concurrent reservations
    const { results, duration } = await simulateConcurrentReservations(testDrop.id, users);

    // Step 3: Analyze results
    const atomicityOk = analyzeResults(results, duration);

    // Step 4: Verify stock
    const stockOk = await verifyStockDecrement();

    // Step 5: Final verdict
    console.log('\n' + '='.repeat(80));
    if (atomicityOk && stockOk) {
      console.log('✅ ALL TESTS PASSED - Atomic reservations are working correctly!');
      console.log('='.repeat(80) + '\n');
      process.exit(0);
    } else {
      console.log('❌ TESTS FAILED - Issues detected in atomic reservation system!');
      console.log('='.repeat(80) + '\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Test interrupted by user');
  await sequelize.close();
  process.exit(0);
});

// Run the tests
runTests();
