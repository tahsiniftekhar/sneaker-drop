const PurchaseService = require('../services/PurchaseService');
const { Purchase, Drop, User } = require('../models/index');
const { toId, sendError } = require('./respond');

exports.completePurchase = async (req, res, next) => {
  const userId = toId(req.body?.userId);
  const reservationId = toId(req.body?.reservationId);

  if (!userId || !reservationId) {
    return res.status(400).json({
      message: 'userId and reservationId are required and must be positive integers.',
      code: 'INVALID_INPUT',
    });
  }

  try {
    const { purchase, created } = await PurchaseService.purchase(userId, reservationId);

    // A replayed request (retry, double click) gets the original purchase back without a second
    // broadcast.
    if (!created) {
      return res.status(200).json({ message: 'Purchase already completed.', purchase, replayed: true });
    }

    await broadcastPurchase(req.app.get('socketio'), purchase, userId);
    return res.status(201).json({ message: 'Purchase successful!', purchase });
  } catch (error) {
    return sendError(res, next, error);
  }
};

// Stock was already taken at reservation time; this refreshes clients' activity feed.
async function broadcastPurchase(io, purchase, userId) {
  if (!io) return;
  try {
    const [drop, recentPurchases] = await Promise.all([
      Drop.findByPk(purchase.drop_id),
      Purchase.findAll({
        where: { drop_id: purchase.drop_id },
        include: [{ model: User, attributes: ['id', 'username'] }],
        order: [['createdAt', 'DESC']],
        limit: 3,
      }),
    ]);
    io.emit('stock_updated', {
      dropId: purchase.drop_id,
      availableStock: drop.availableStock,
      purchases: recentPurchases,
      triggeredByUserId: userId,
    });
  } catch (error) {
    // The purchase is committed; a failed broadcast must not turn it into an error response.
    console.error('Purchase broadcast failed:', error.message);
  }
}
