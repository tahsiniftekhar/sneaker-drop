import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const socketInstance: Socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ['websocket'],
});

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socketInstance.connected);

  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socketInstance.on('connect', onConnect);
    socketInstance.on('disconnect', onDisconnect);

    return () => {
      socketInstance.off('connect', onConnect);
      socketInstance.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket: socketInstance, isConnected };
};
