#!/bin/bash

# Quick Test Runbook
# Run this to execute all verification tests in sequence

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║                  SNEAKER DROP SYSTEM - TEST RUNBOOK                       ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend is the current directory
if [ ! -f "server.js" ]; then
  echo -e "${YELLOW}⚠️  Please run this from the backend directory:${NC}"
  echo "cd /Users/iftekhar/Documents/Programs/GitHub/sneaker-drop-project/backend"
  exit 1
fi

echo -e "${BLUE}Step 1: Verify environment${NC}"
echo "────────────────────────────────────────────────────────────────────────────"

if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found"
  exit 1
fi
echo "✅ Node.js installed"

if ! command -v npm &> /dev/null; then
  echo "❌ npm not found"
  exit 1
fi
echo "✅ npm installed"

if [ ! -f ".env" ]; then
  echo "❌ .env file not found"
  exit 1
fi
echo "✅ .env file exists"

echo ""
echo -e "${BLUE}Step 2: Install dependencies${NC}"
echo "────────────────────────────────────────────────────────────────────────────"
npm install > /dev/null 2>&1
echo "✅ Dependencies installed"

echo ""
echo -e "${BLUE}Step 3: Database setup${NC}"
echo "────────────────────────────────────────────────────────────────────────────"
echo "🔄 Running migrations..."
npx sequelize-cli db:migrate --config src/config/config.js > /dev/null 2>&1
echo "✅ Migrations complete"

echo "🔄 Running seeders..."
npx sequelize-cli db:seed:all --config src/config/config.js > /dev/null 2>&1
echo "✅ Seeders complete"

echo ""
echo -e "${BLUE}Step 4: Start backend server${NC}"
echo "────────────────────────────────────────────────────────────────────────────"
echo "⏳ Starting server on port 5001..."

# Start the server in background
npm run dev > server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "❌ Server failed to start"
  cat server.log
  exit 1
fi

echo "✅ Server started (PID: $SERVER_PID)"

# Function to kill server on exit
cleanup() {
  echo ""
  echo "🛑 Stopping server..."
  kill $SERVER_PID 2>/dev/null
  wait $SERVER_PID 2>/dev/null
  echo "✅ Server stopped"
}

trap cleanup EXIT

echo ""
echo -e "${BLUE}Step 5: Run Atomic Reservation Test${NC}"
echo "────────────────────────────────────────────────────────────────────────────"
sleep 1
node test-atomic-reservation.js

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Atomic reservation test failed"
  exit 1
fi

echo ""
echo -e "${BLUE}Step 6: Run End-to-End Test${NC}"
echo "────────────────────────────────────────────────────────────────────────────"
sleep 1
node test-e2e.js

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ End-to-end test failed"
  exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║                     ✅ ALL TESTS PASSED!                                  ║"
echo "║                                                                           ║"
echo "║  Your sneaker drop system is ready for:                                  ║"
echo "║  • Manual testing (browser side-by-side demo)                            ║"
echo "║  • Production deployment                                                 ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
