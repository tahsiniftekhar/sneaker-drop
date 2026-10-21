'use strict';

// Database-level guarantees for the reserve -> purchase -> expire lifecycle.
// See docs/reservations.md for why each one exists.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      // 1. One purchase per reservation, so a retried or concurrent purchase cannot create a second
      //    row. Purchases made before this migration have no reservation link and stay NULL
      //    (NULLs never conflict in a unique index); every new purchase sets it.
      await queryInterface.addColumn(
        'Purchases',
        'reservation_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Reservations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        { transaction }
      );
      await q('CREATE UNIQUE INDEX "purchases_reservation_id_key" ON "Purchases" (reservation_id)');

      // 2. At most one pending reservation per user per drop. Older code allowed several, so before
      //    adding the index keep each user's newest pending reservation and expire the rest,
      //    returning their units to stock.
      await q(`
        WITH dup AS (
          SELECT id, drop_id FROM (
            SELECT id, drop_id,
                   row_number() OVER (PARTITION BY user_id, drop_id ORDER BY id DESC) AS rn
            FROM "Reservations" WHERE status = 'pending'
          ) ranked WHERE rn > 1
        ),
        expired AS (
          UPDATE "Reservations" r SET status = 'expired', "updatedAt" = now()
          FROM dup WHERE r.id = dup.id
          RETURNING r.drop_id
        )
        UPDATE "Drops" d SET "availableStock" = d."availableStock" + c.n, "updatedAt" = now()
        FROM (SELECT drop_id, count(*) AS n FROM expired GROUP BY drop_id) c
        WHERE d.id = c.drop_id
      `);
      await q(`
        CREATE UNIQUE INDEX "reservations_one_pending_per_user_drop"
        ON "Reservations" (user_id, drop_id) WHERE status = 'pending'
      `);

      // 3. The expiry sweeper scans pending reservations by deadline.
      await q(`
        CREATE INDEX "reservations_pending_expires_at"
        ON "Reservations" ("expiresAt") WHERE status = 'pending'
      `);

      // 4. Stock can never go negative or above the total, whatever the application does.
      await q(`
        ALTER TABLE "Drops" ADD CONSTRAINT "drops_available_stock_range"
        CHECK ("availableStock" >= 0 AND "availableStock" <= "totalStock")
      `);

      // 5. Status and ownership are required on every reservation.
      await q(`ALTER TABLE "Reservations" ALTER COLUMN status SET NOT NULL`);
      await q(`ALTER TABLE "Reservations" ALTER COLUMN user_id SET NOT NULL`);
      await q(`ALTER TABLE "Reservations" ALTER COLUMN drop_id SET NOT NULL`);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q('ALTER TABLE "Reservations" ALTER COLUMN drop_id DROP NOT NULL');
      await q('ALTER TABLE "Reservations" ALTER COLUMN user_id DROP NOT NULL');
      await q('ALTER TABLE "Reservations" ALTER COLUMN status DROP NOT NULL');
      await q('ALTER TABLE "Drops" DROP CONSTRAINT IF EXISTS "drops_available_stock_range"');
      await q('DROP INDEX IF EXISTS "reservations_pending_expires_at"');
      await q('DROP INDEX IF EXISTS "reservations_one_pending_per_user_drop"');
      await q('DROP INDEX IF EXISTS "purchases_reservation_id_key"');
      await queryInterface.removeColumn('Purchases', 'reservation_id', { transaction });
    });
  },
};
