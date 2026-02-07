const { sequelize } = require('../config/database');
const { Drop, Reservation } = require('../models/index');

class ReservationService {
  static async createAtomicReservation(userId, dropId, io) {
    const transaction = await sequelize.transaction();

    try {
      const drop = await Drop.findByPk(dropId, {
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!drop || drop.available_stock <= 0) {
        throw new Error('Item out of stock or not found');
      }

      drop.available_stock -= 1;
      await drop.save({ transaction });

      const expiresAt = new Date(Date.now() + 60000);
      const reservation = await Reservation.create({
        user_id: userId,
        drop_id: dropId,
        expires_at: expiresAt,
        status: 'pending'
      }, { transaction });

      await transaction.commit();

      io.emit('stock_updated', {
        dropId: dropId,
        available_stock: drop.available_stock
      });

      this.startRecoveryTimer(reservation.id, dropId, io);

      return reservation;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static startRecoveryTimer(reservationId, dropId, io) {
    setTimeout(async () => {
      const reser = await Reservation.findByPk(reservationId);

      if (reser && reser.status === 'pending') {
        const transaction = await sequelize.transaction();
        try {
          reser.status = 'expired';
          await reser.save({ transaction });

          const drop = await Drop.findByPk(dropId, { lock: transaction.LOCK.UPDATE, transaction });
          drop.available_stock += 1;
          await drop.save({ transaction });

          await transaction.commit();

          io.emit('stock_updated', {
            dropId: dropId,
            available_stock: drop.available_stock
          });
          console.log(`Reservation ${reservationId} expired. Stock returned.`);
        } catch (e) {
          await transaction.rollback();
        }
      }
    }, 60000);
  }
}

module.exports = ReservationService;
