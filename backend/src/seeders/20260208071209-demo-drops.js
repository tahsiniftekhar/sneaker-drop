'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('Drops', [
      {
        name: 'Travis Scott x AJ1 Low "Olive"',
        price: 190.0,
        totalStock: 3,
        availableStock: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Nike Dunk Low "Panda"',
        price: 110.0,
        totalStock: 50,
        availableStock: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Adidas Yeezy Boost 350 V2',
        price: 230.0,
        totalStock: 10,
        availableStock: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },
  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('Drops', null, {});
  },
};
