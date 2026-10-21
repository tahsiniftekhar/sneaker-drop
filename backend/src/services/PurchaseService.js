const sequelize = require('../config/database');
const { AppError, uniqueViolation } = require('../errors');

class PurchaseService {
  // Turns a pending, unexpired reservation into a purchase. Safe to retry: calling it again for a
  // reservation that was already purchased returns the original purchase with created = false.
  //
  // The reservation leaves 'pending' through one conditional UPDATE. The expiry sweeper uses the
  // same condition, so whichever statement reaches the row first wins and the other matches no row:
  // a reservation is either purchased or expired, never both, and the unit it holds is either sold
  // or returned to stock exactly once. A concurrent retry waits on the row lock, then matches no
  // row and returns the purchase the first call committed. The unique index on
  // Purchases.reservation_id guarantees one purchase per reservation even if this code is bypassed.
  static async purchase(userId, reservationId, { transaction } = {}) {
    const run = async (t) => {
      const [claimed] = await sequelize.query(
        `UPDATE "Reservations"
         SET status = 'completed', "updatedAt" = now()
         WHERE id = :reservationId AND user_id = :userId
           AND status = 'pending' AND "expiresAt" > now()
         RETURNING id, drop_id`,
        { replacements: { reservationId, userId }, transaction: t }
      );

      if (claimed.length === 0) return PurchaseService.explainUnclaimed(userId, reservationId, t);

      try {
        const [[purchase]] = await sequelize.query(
          `INSERT INTO "Purchases" (user_id, drop_id, reservation_id, "createdAt", "updatedAt")
           VALUES (:userId, :dropId, :reservationId, now(), now())
           RETURNING *`,
          { replacements: { userId, dropId: claimed[0].drop_id, reservationId }, transaction: t }
        );
        return { purchase, created: true };
      } catch (error) {
        // A purchase row for a reservation that was still pending can only come from data written
        // outside this service; refuse rather than guess.
        if (uniqueViolation(error) === 'purchases_reservation_id_key') {
          throw new AppError(409, 'PURCHASE_CONFLICT', 'Reservation already has a purchase.');
        }
        throw error;
      }
    };

    return transaction ? run(transaction) : sequelize.transaction(run);
  }

  // The conditional UPDATE matched nothing. Work out why: a replay of a completed purchase,
  // an expired reservation, or one that does not exist for this user.
  static async explainUnclaimed(userId, reservationId, t) {
    const [[existing]] = await sequelize.query(
      'SELECT * FROM "Purchases" WHERE reservation_id = :reservationId AND user_id = :userId',
      { replacements: { reservationId, userId }, transaction: t }
    );
    if (existing) return { purchase: existing, created: false };

    const [[reservation]] = await sequelize.query(
      'SELECT status FROM "Reservations" WHERE id = :reservationId AND user_id = :userId',
      { replacements: { reservationId, userId }, transaction: t }
    );
    if (!reservation) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found.');
    // 'expired', or still 'pending' past its deadline because the sweeper has not reached it yet.
    throw new AppError(409, 'RESERVATION_EXPIRED', 'Reservation has expired.');
  }
}

module.exports = PurchaseService;
