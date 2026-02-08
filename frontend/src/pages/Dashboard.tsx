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
    triggeredByUserId?: number;
  } | null>(null);
  const recentActionsRef = useRef<Set<string>>(new Set());
  const previousStockRef = useRef<Record<number, number>>({});
  const { socket } = useSocket();

  const createActionKey = (userId: number, dropId: number) => `${userId}:${dropId}`;

  const registerUserAction = useCallback((userId: number, dropId: number) => {
    const actionKey = createActionKey(userId, dropId);
    recentActionsRef.current.add(actionKey);

    setTimeout(() => {
      recentActionsRef.current.delete(actionKey);
    }, 2000);
  }, []);

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
              triggeredByUserId: data.triggeredByUserId,
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

    if (lastUpdate.type === 'decrease' && lastUpdate.triggeredByUserId) {
      const actionKey = createActionKey(lastUpdate.triggeredByUserId, lastUpdate.dropId);
      if (recentActionsRef.current.has(actionKey)) {
        recentActionsRef.current.delete(actionKey);
        return;
      }
    }

    const isLowStock = lastUpdate.stock > 0 && lastUpdate.stock <= 5;

    if (lastUpdate.type === 'decrease') {
      toast(
        (_t) => (
          <span className="flex items-center gap-2">
            {isLowStock ? '⚠️' : '📦'}
            <span className="font-medium text-neutral-900">
              <strong className="text-indigo-600">{lastUpdate.name}</strong>
              {isLowStock ? ' is almost gone!' : ' stock updated:'}
              <span
                className={`ml-2 px-2 py-0.5 rounded font-bold ${
                  isLowStock
                    ? 'bg-red-100 text-red-600 animate-pulse'
                    : 'bg-neutral-100 text-neutral-800'
                }`}
              >
                {lastUpdate.stock} left
              </span>
            </span>
          </span>
        ),
        { duration: 5000, position: 'top-right' }
      );
    } else {
      toast.success(
        (_t) => (
          <span className="flex items-center gap-2">
            <span className="animate-bounce">✨</span>
            <span className="font-medium text-neutral-900">
              Restock! <strong className="text-emerald-600">{lastUpdate.name}</strong> is back with
              <span className="ml-2 font-bold text-emerald-700">{lastUpdate.stock} units</span>
            </span>
          </span>
        ),
        { duration: 6000, icon: null }
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
            <DropCard key={drop.id} drop={drop} onActionTriggered={registerUserAction} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
