const { Server } = require('socket.io');

const initSocket = (server) => {
  const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';

  const io = new Server(server, {
    cors: { origin: allowedOrigin, methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    socket.on('disconnect', () => console.log('User disconnected'));
  });

  return io;
};

module.exports = initSocket;
