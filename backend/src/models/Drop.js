const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Drop = sequelize.define('Drop', {
  name: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  totalStock: { type: DataTypes.INTEGER, allowNull: false },
  availableStock: { type: DataTypes.INTEGER, allowNull: false }
});

module.exports = Drop;
