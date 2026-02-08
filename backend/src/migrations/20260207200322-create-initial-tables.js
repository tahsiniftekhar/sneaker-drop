'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Create Users Table
    await queryInterface.createTable('Users', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      username: { type: Sequelize.STRING, allowNull: false, unique: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 2. Create Drops Table
    await queryInterface.createTable('Drops', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      totalStock: { type: Sequelize.INTEGER, allowNull: false },
      availableStock: { type: Sequelize.INTEGER, allowNull: false },

      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 3. Create Reservations Table
    await queryInterface.createTable('Reservations', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      status: {
        type: Sequelize.ENUM('pending', 'completed', 'expired'),
        defaultValue: 'pending',
      },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      // Foreign Keys (matching your associations)
      user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      drop_id: {
        type: Sequelize.INTEGER,
        references: { model: 'Drops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // 4. Create Purchases Table
    await queryInterface.createTable('Purchases', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      // Foreign Keys (matching your associations)
      user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      drop_id: {
        type: Sequelize.INTEGER,
        references: { model: 'Drops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface, Sequelize) {
    // Drop in reverse order to avoid Foreign Key constraint errors
    await queryInterface.dropTable('Purchases');
    await queryInterface.dropTable('Reservations');
    await queryInterface.dropTable('Drops');
    await queryInterface.dropTable('Users');
    // Also drop the ENUM type created for Postgres
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Reservations_status";');
  },
};
