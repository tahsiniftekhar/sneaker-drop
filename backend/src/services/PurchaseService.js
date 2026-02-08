const sequelize = require('../config/database');
const { Reservation, Purchase, Drop, User } = require('../models/index');

class PurchaseService {
  static async executePurchase(userId, reservationId, io) {
    const transaction = await sequelize.transaction();

    try {
      const reservation = await Reservation.findOne({
        where: {
          id: reservationId,
          user_id: userId,
          status: 'pending',
        },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      if (!reservation) {
        throw new Error('Reservation invalid, expired, or already processed.');
      }

      const purchase = await Purchase.create(
        {
          user_id: userId,
          drop_id: reservation.drop_id,
        },
        { transaction }
      );

      reservation.status = 'completed';
      await reservation.save({ transaction });

      // Fetch the drop to get current availableStock for broadcast
      const drop = await Drop.findByPk(reservation.drop_id, { transaction });

      await transaction.commit();

      // Fetch top 3 recent purchases for activity feed
      const recentPurchases = await Purchase.findAll({
        where: { drop_id: reservation.drop_id },
        include: [{ model: User, attributes: ['id', 'username'] }],
        order: [['createdAt', 'DESC']],
        limit: 3,
      });

      // Emit stock_updated so all clients see the stock decrement in real-time
      io.emit('stock_updated', {
        dropId: reservation.drop_id,
        availableStock: drop.availableStock,
        purchases: recentPurchases,
      });

      return purchase;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = PurchaseService;
