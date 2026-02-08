'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('Users', [
      { username: 'sneakerhead_01', createdAt: new Date(), updatedAt: new Date() },
      { username: 'hypebeast_99', createdAt: new Date(), updatedAt: new Date() },
      { username: 'sole_collector', createdAt: new Date(), updatedAt: new Date() },
    ]);
  },
  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('Users', null, {});
  },
};
