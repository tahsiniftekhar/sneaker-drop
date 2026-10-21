const { AppError } = require('../errors');

// Positive integer id from a request field, or null.
function toId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Sends AppErrors as { message, code } with their status; anything else goes to the global handler.
function sendError(res, next, error) {
  if (error instanceof AppError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  return next(error);
}

module.exports = { toId, sendError };
