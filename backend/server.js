require('dotenv').config({ quiet: true });
const express = require('express');
const http = require('http');
const cors = require('cors');
const sequelize = require('./src/config/database');
const routes = require('./src/routes');
const initSocket = require('./src/config/socket');
const ExpiryService = require('./src/services/ExpiryService');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Behind Cloudflare -> Caddy (two proxy hops)
app.set('trust proxy', 2);

// Liveness/readiness probe (no auth)
app.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'ok', database: 'up' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'down' });
  }
});

// Routes
app.use('/api', routes);

// Socket.io
const io = initSocket(server);
app.set('socketio', io);

// Global Error Handler
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err.stack);
  res.status(status).json({
    success: false,
    // Client errors (e.g. malformed JSON) keep their message; server errors never leak internals.
    message: status < 500 ? err.message : 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('⏳ Connecting to database...');
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully.');
  } catch (error) {
    console.error('❌ DB Connection Error:', error);
  }
}

startServer();

// Reservation expiry runs from the database, so it survives restarts: the first sweep releases
// anything that expired while the process was down.
const stopSweeper = ExpiryService.start(io);

const shutdown = () => {
  stopSweeper();
  server.close(() => sequelize.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
