// Reset the demo database: drop and recreate the public schema, migrate, seed.
// Safe to run repeatedly. DESTROYS ALL DATA in the target database.
// Refuses to run unless DEMO_RESET_ALLOWED=true and the database is "sneaker-drop"
// (demo-reset-guard.js). `--check` runs the guard only and touches nothing.
require('dotenv').config({ quiet: true });
const { execFileSync } = require('child_process');
const path = require('path');
const { demoResetRefusal } = require('./demo-reset-guard');

const refusal = demoResetRefusal(process.env);
if (refusal) {
  console.error(`Refusing demo reset: ${refusal}`);
  process.exit(1);
}
if (process.argv.includes('--check')) {
  console.log('Demo reset allowed for this database (check only, nothing changed).');
  process.exit(0);
}

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
