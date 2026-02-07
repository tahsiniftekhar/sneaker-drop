const { Sequelize } = require('sequelize');
require('dotenv').config({ quiet: true });

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: process.env.DATABASE_URL.includes('neon.tech') ? {
      require: true,
      rejectUnauthorized: false
    } : false
  }
});

module.exports = sequelize;
