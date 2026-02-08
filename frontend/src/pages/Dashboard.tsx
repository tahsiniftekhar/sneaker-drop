import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import DropCard from '../components/DropCard';
import { useSocket } from '../hooks/useSocket';
import type { Drop, StockUpdate } from '../types';

const Dashboard: React.FC = () => {
  const [drops, setDrops] = useState<Drop[]>([]);
  const { socket } = useSocket();

  useEffect(() => {
    const fetchDrops = async () => {
      try {
        const response = await api.get<Drop[]>('/drops');
        setDrops(response.data);
      } catch (err) {
        console.error('Failed to load drops', err);
      }
    };
    fetchDrops();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('stock_updated', (data: StockUpdate) => {
        setDrops((currentDrops) =>
          currentDrops.map((d) =>
            d.id === data.dropId ? { ...d, availableStock: data.availableStock } : d
          )
        );
      });
    }

    return () => {
      socket?.off('stock_updated');
    };
  }, [socket]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8 selection:bg-indigo-500/30">
      <header className="mb-16 text-center max-w-4xl mx-auto text-white">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 drop-shadow-lg">
          Limited Edition Drops 👟
        </h1>
        <p className="text-neutral-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
          Real time stock updates. Reserve fast and complete your purchase before the timer runs
          out.
        </p>
      </header>

      {drops.length === 0 ? (
        <div className="text-center text-neutral-500 animate-pulse">Loading drops...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {drops.map((drop) => (
            <DropCard key={drop.id} drop={drop} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
