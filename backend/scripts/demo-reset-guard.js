// Guard for reset-demo.js: the reset drops the public schema, so it refuses to run unless it is
// explicitly allowed and DATABASE_URL names the demo database, so a wrong URL never wipes
// another database.
const ALLOWED_DATABASES = ['sneaker-drop'];

function databaseName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    return '';
  }
}

// Why the reset must not run, or null when it may.
function demoResetRefusal(env) {
  if (env.DEMO_RESET_ALLOWED !== 'true') return 'DEMO_RESET_ALLOWED is not "true".';
  const name = databaseName(env.DATABASE_URL || '');
  if (!ALLOWED_DATABASES.includes(name)) {
    return `DATABASE_URL targets database "${name}", allowed: ${ALLOWED_DATABASES.join(', ')}.`;
  }
  return null;
}

module.exports = { ALLOWED_DATABASES, databaseName, demoResetRefusal };
