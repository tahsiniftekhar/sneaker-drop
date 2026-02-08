import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

export const useDropActions = (dropId: number, dropName: string, userId: number | null) => {
  const [loading, setLoading] = useState(false);
  const [isPurchased, setIsPurchased] = useState(false);
  const [reservationId, setReservationId] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    let timer: number | undefined;

    if (reservationId && timeLeft > 0) {
      timer = window.setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setReservationId(null);
      setTimeLeft(60);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [reservationId, timeLeft]);

  const handleReserve = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await api.post('/reservations', {
        userId: userId,
        dropId: dropId,
      });
      setReservationId(res.data.id);
      setTimeLeft(60);
      toast.success(`Successfully reserved ${dropName}!`, { duration: 4000 });
    } catch (err: any) {
      toast.error(`Failed to reserve ${dropName}. ${err.response?.data?.message || err.message}`, {
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!reservationId || !userId) return;

    setLoading(true);
    try {
      await api.post('/purchases/complete', {
        userId: userId,
        reservationId,
      });

      setIsPurchased(true); 
      setReservationId(null);
      toast.success(`🎉 Purchase of ${dropName} complete!`, { duration: 5000 });
    } catch (err: any) {
      toast.error(
        `Failed to complete purchase for ${dropName}. ${err.response?.data?.message || err.message}`,
        { duration: 4000 }
      );
      setReservationId(null);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    isPurchased,
    reservationId,
    timeLeft,
    handleReserve,
    handlePurchase,
  };
};
