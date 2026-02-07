import React, { useEffect, useState } from 'react';
import { useSocket } from '../hooks/useSocket';
import { type Drop } from '../types';

export const LiveDropNotifier: React.FC = () => {
  const { socket, isConnected } = useSocket();
  const [latestDrop, setLatestDrop] = useState<Drop | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('new-drop', (data: Drop) => {
      setLatestDrop(data);

      setTimeout(() => setLatestDrop(null), 5000);
    });

    return () => {
      socket.off('new-drop');
    };
  }, [socket]);

  if (!latestDrop) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg shadow-2xl border border-yellow-400 animate-bounce">
      <h3 className="font-bold text-yellow-400">🔥 NEW DROP LIVE!</h3>
      <p>{latestDrop.name} - ${latestDrop.price}</p>
      <div className="text-xs mt-1 text-gray-400">
        Status: {isConnected ? 'Connected' : 'Reconnecting...'}
      </div>
    </div>
  );
};
