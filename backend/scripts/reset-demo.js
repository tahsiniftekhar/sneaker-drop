// Reset the demo database: drop and recreate the public schema, migrate, seed.
// Safe to run repeatedly. DESTROYS ALL DATA in the target database.
const { execFileSync } = require('child_process');
const path = require('path');
const sequelize = require('../src/config/database');

const cli = path.resolve(__dirname, '..', 'node_modules', '.bin', 'sequelize-cli');
const run = (...args) => execFileSync(cli, args, { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });

(async () => {
  try {
    console.log('Resetting schema...');
    await sequelize.query('DROP SCHEMA IF EXISTS public CASCADE');
    await sequelize.query('CREATE SCHEMA public');
    await sequelize.close();
    run('db:migrate');
    run('db:seed:all');
    console.log('Demo reset complete.');
  } catch (error) {
    console.error('Demo reset failed:', error.message);
    process.exit(1);
  }
})();
