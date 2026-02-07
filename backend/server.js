require('dotenv').config({ quiet: true });
const express = require('express');
const http = require('http');
const cors = require('cors');
const sequelize = require('./src/config/database');
const routes = require('./src/routes');
const initSocket = require('./src/config/socket');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

// Socket.io
const io = initSocket(server);
app.set('socketio', io);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('⏳ Connecting to database (Neon)...');
  });

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully.');

  } catch (error) {
    console.error('❌ DB Connection Error:', error);
  }
}

startServer();
