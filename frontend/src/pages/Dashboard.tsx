import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import DropCard from '../components/DropCard';
import { useSocket } from '../hooks/useSocket';
import type { Drop, StockUpdate } from '../types';

const Dashboard: React.FC = () => {
  const [drops, setDrops] = useState<Drop[]>([]);
  const [lastUpdate, setLastUpdate] = useState<{
    dropId: number;
    stock: number;
    name: string;
    type: 'decrease' | 'increase';
  } | null>(null);
  const previousStockRef = useRef<Record<number, number>>({});
  const { socket } = useSocket();

  useEffect(() => {
    const fetchDrops = async () => {
      try {
        const response = await api.get<Drop[]>('/drops');
        setDrops(response.data);
        response.data.forEach((drop) => {
          previousStockRef.current[drop.id] = drop.availableStock;
        });
      } catch (err) {
        console.error('Failed to load drops', err);
      }
    };
    fetchDrops();
  }, []);

  const handleStockUpdate = useCallback((data: StockUpdate) => {
    setDrops((currentDrops) => {
      return currentDrops.map((d) => {
        if (d.id === data.dropId) {
          const oldStock = previousStockRef.current[d.id] || d.availableStock;
          const newStock = data.availableStock;
          const stockDifference = oldStock - newStock;

          previousStockRef.current[d.id] = newStock;

          if (stockDifference !== 0) {
            setLastUpdate({
              dropId: d.id,
              stock: newStock,
              name: d.name,
              type: stockDifference > 0 ? 'decrease' : 'increase',
            });
          }

          return {
            ...d,
            availableStock: newStock,
            Purchases: data.purchases || d.Purchases,
          };
        }
        return d;
      });
    });
  }, []);

  useEffect(() => {
    if (!lastUpdate) return;

    if (lastUpdate.type === 'decrease') {
      toast.success(
        `📦 ${lastUpdate.name} - ${lastUpdate.stock} item${lastUpdate.stock !== 1 ? 's' : ''} left`,
        {
          duration: 5000,
        }
      );
    } else {
      toast.success(
        `✨ ${lastUpdate.name} - Stock recovered! ${lastUpdate.stock} available again`,
        {
          duration: 6000,
        }
      );
    }
  }, [lastUpdate]);

  useEffect(() => {
    if (socket) {
      socket.on('stock_updated', handleStockUpdate);
    }

    return () => {
      socket?.off('stock_updated', handleStockUpdate);
    };
  }, [socket, handleStockUpdate]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8 selection:bg-indigo-500/30">
      <header className="mb-16 text-center max-w-4xl mx-auto text-white">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-4 drop-shadow-lg flex items-center justify-center gap-4">
          Limited Edition Drops
          <img src="/sneaker.svg" alt="Sneakers Icon" className="w-12 h-12 md:w-16 md:h-16" />
        </h1>
        <p className="text-neutral-400 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
          Real-time stock updates. Reserve fast and complete your purchase before the timer runs
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
