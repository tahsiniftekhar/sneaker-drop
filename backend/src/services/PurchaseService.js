const { sequelize } = require('../config/database');
const { Reservation, Purchase } = require('../models/index');

class PurchaseService {
  static async executePurchase(userId, reservationId) {
    const transaction = await sequelize.transaction();

    try {
      const reservation = await Reservation.findOne({
        where: {
          id: reservationId,
          user_id: userId,
          status: 'pending'
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      });

      if (!reservation) {
        throw new Error('Reservation invalid, expired, or already processed.');
      }

      const purchase = await Purchase.create({
        user_id: userId,
        drop_id: reservation.drop_id
      }, { transaction });

      reservation.status = 'completed';
      await reservation.save({ transaction });

      await transaction.commit();
      return purchase;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = PurchaseService;
