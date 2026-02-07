import { useEffect, useState } from 'react';
import api from '../api/axios';

export const useDropActions = (dropId: number) => {
  const [loading, setLoading] = useState(false);
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
    } catch (err) {
      alert('Too late. Item is out of stock.');
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
      //setIsPurchased(true); // setIsPurchased is not defined
      setReservationId(null);
    } catch (err) {
      alert('Reservation expired. Stock was released.');
      setReservationId(null);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    reservationId,
    timeLeft,
    handleReserve,
    handlePurchase,
  };
};
