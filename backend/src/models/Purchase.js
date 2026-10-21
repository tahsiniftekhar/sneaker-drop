const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Purchase = sequelize.define('Purchase', {
  reservation_id: { type: DataTypes.INTEGER, allowNull: true },
});

module.exports = Purchase;
