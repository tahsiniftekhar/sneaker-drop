const sequelize = require('../config/database');
const { AppError, uniqueViolation, foreignKeyViolation } = require('../errors');

const TTL_SECONDS = Number(process.env.RESERVATION_TTL_SECONDS) || 60;

class ReservationService {
  // Takes one unit of stock and holds it for the user until expiresAt.
  //
  // The stock decrement is a single conditional UPDATE: it only succeeds while availableStock > 0,
  // and the row lock it takes makes concurrent reservers for the same drop queue behind each other
  // and re-check the condition, so stock can never be oversold (the CHECK constraint on Drops backs
  // this up). The partial unique index on (user_id, drop_id) WHERE status = 'pending' rejects a
  // second hold by the same user; the transaction then rolls back and the unit returns to stock.
  //
  // The caller's own hold on this drop that is past its deadline but not yet swept is expired first,
  // and its unit goes back in the same Drops UPDATE, so re-reserving right after expiry works
  // without waiting for the sweeper. Doing this before touching Drops keeps the sweeper's lock
  // order (Reservations, then Drops): a sweep expiring the same row either finishes first, and this
  // UPDATE waits for it and then matches nothing, or finds the row locked and skips it.
  static async reserve(userId, dropId, { transaction } = {}) {
    const run = async (t) => {
      const [released] = await sequelize.query(
        `UPDATE "Reservations"
         SET status = 'expired', "updatedAt" = now()
         WHERE user_id = :userId AND drop_id = :dropId
           AND status = 'pending' AND "expiresAt" <= now()
         RETURNING id`,
        { replacements: { userId, dropId }, transaction: t }
      );

      const [taken] = await sequelize.query(
        `UPDATE "Drops"
         SET "availableStock" = "availableStock" + :released - 1, "updatedAt" = now()
         WHERE id = :dropId AND "availableStock" + :released > 0
         RETURNING id, "availableStock"`,
        { replacements: { dropId, released: released.length }, transaction: t }
      );

      if (taken.length === 0) {
        const [exists] = await sequelize.query('SELECT 1 FROM "Drops" WHERE id = :dropId', {
          replacements: { dropId },
          transaction: t,
        });
        if (exists.length === 0) throw new AppError(404, 'DROP_NOT_FOUND', 'Drop not found.');
        throw new AppError(409, 'SOLD_OUT', 'Item is out of stock.');
      }

      let reservation;
      try {
        [[reservation]] = await sequelize.query(
          `INSERT INTO "Reservations" (user_id, drop_id, status, "expiresAt", "createdAt", "updatedAt")
           VALUES (:userId, :dropId, 'pending', now() + make_interval(secs => :ttl), now(), now())
           RETURNING *`,
          { replacements: { userId, dropId, ttl: TTL_SECONDS }, transaction: t }
        );
      } catch (error) {
        if (uniqueViolation(error) === 'reservations_one_pending_per_user_drop') {
          throw new AppError(409, 'ALREADY_RESERVED', 'You already hold a reservation for this drop.');
        }
        if (foreignKeyViolation(error) === 'Reservations_user_id_fkey') {
          throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
        }
        throw error;
      }

      return { reservation, availableStock: taken[0].availableStock };
    };

    return transaction ? run(transaction) : sequelize.transaction(run);
  }
}

module.exports = ReservationService;
module.exports.TTL_SECONDS = TTL_SECONDS;
