import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSocket } from '../hooks/useSocket';
import { type Drop } from '../types';

export const LiveDropNotifier: React.FC = () => {
  const { socket, isConnected } = useSocket();
  const [latestDrop, setLatestDrop] = useState<Drop | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.on('new-drop', (data: Drop) => {
      // Display a toast notification for the new drop
      toast.custom(
        (t) => (
          <div
            className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-black text-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-yellow-400 ring-opacity-5 border border-yellow-400`}
          >
            <div className="flex-1 w-0 p-4">
              <div className="flex items-start">
                <div className="ml-3 flex-1">
                  <p className="text-sm font-bold text-yellow-400">🔥 NEW DROP LIVE!</p>
                  <p className="mt-1 text-sm text-white">
                    {data.name} - ${data.price}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex border-l border-yellow-400">
              <button
                onClick={() => toast.dismiss(t.id)}
                className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-yellow-400 hover:text-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              >
                Close
              </button>
            </div>
          </div>
        ),
        { duration: 5000 }
      ); // Toast will disappear after 5 seconds
    });

    return () => {
      socket.off('new-drop');
    };
  }, [socket]);

  // This component no longer renders UI directly, it just triggers toasts
  return null;
};
