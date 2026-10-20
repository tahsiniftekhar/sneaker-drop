require('dotenv').config({ quiet: true });

// SSL is opt-in. Set DB_SSL=true for hosted databases that require TLS (e.g. Neon).
// Leave it unset for a Postgres reachable over a private network (e.g. Docker).
const useSsl = ['true', '1'].includes(String(process.env.DB_SSL || '').toLowerCase());

const dialectOptions = {
  keepAlive: true,
  ...(useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {}),
};

const base = {
  url: process.env.DATABASE_URL,
  dialect: 'postgres',
  dialectOptions,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  logging: false,
};

module.exports = {
  development: { ...base },
  production: { ...base },
};
