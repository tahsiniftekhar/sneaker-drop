const { Sequelize } = require('sequelize');
const configs = require('./config'); // Import the config we just made

// Determine which environment we are in (default to development)
const env = process.env.NODE_ENV || 'development';
const config = configs[env];

// Initialize Sequelize using the URL and the config object
const sequelize = new Sequelize(config.url, config);

module.exports = sequelize;
