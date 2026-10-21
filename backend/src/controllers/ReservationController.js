const ReservationService = require('../services/ReservationService');
const { toId, sendError } = require('./respond');

exports.reserveItem = async (req, res, next) => {
  const userId = toId(req.body?.userId);
  const dropId = toId(req.body?.dropId);

  if (!userId || !dropId) {
    return res.status(400).json({
      message: 'userId and dropId are required and must be positive integers.',
      code: 'INVALID_INPUT',
    });
  }

  try {
    const { reservation, availableStock } = await ReservationService.reserve(userId, dropId);

    req.app.get('socketio')?.emit('stock_updated', {
      dropId,
      availableStock,
      triggeredByUserId: userId,
    });

    return res.status(201).json(reservation);
  } catch (error) {
    return sendError(res, next, error);
  }
};
