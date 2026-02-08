import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';

export const useDropActions = (dropId: number, dropName: string) => {
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
    setLoading(true);
    try {
      const res = await api.post('/reservations', {
        userId: 1,
        dropId: dropId,
      });
      setReservationId(res.data.id);
      setTimeLeft(60);
      toast.success(`Successfully reserved ${dropName}!`);
    } catch (err: any) {
      toast.error(`Failed to reserve ${dropName}. ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!reservationId) return;

    setLoading(true);
    try {
      await api.post('/purchases/complete', {
        userId: 1,
        reservationId,
      });
      setReservationId(null);
      toast.success(`Purchase of ${dropName} complete!`);
    } catch (err: any) {
      toast.error(
        `Failed to complete purchase for ${dropName}. ${err.response?.data?.message || err.message}`
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
