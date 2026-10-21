// Errors the API reports to the client with a specific status and a stable code.
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Postgres error code for a unique-constraint violation, and the constraint that raised it.
function uniqueViolation(error) {
  const pg = error?.parent || error?.original || error;
  return pg?.code === '23505' ? pg.constraint : null;
}

function foreignKeyViolation(error) {
  const pg = error?.parent || error?.original || error;
  return pg?.code === '23503' ? pg.constraint : null;
}

module.exports = { AppError, uniqueViolation, foreignKeyViolation };
