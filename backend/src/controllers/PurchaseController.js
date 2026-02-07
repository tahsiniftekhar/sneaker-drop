const PurchaseService = require('../services/PurchaseService');

exports.completePurchase = async (req, res) => {
  const { userId, reservationId } = req.body;
  const io = req.app.get('socketio');

  if (!userId || !reservationId) {
    return res.status(400).json({
      message: 'Missing required fields: userId and reservationId are mandatory.',
    });
  }

  try {
    const purchase = await PurchaseService.executePurchase(userId, reservationId, io);
    return res.status(201).json({
      message: 'Purchase successful!',
      purchase,
    });
  } catch (error) {
    console.error('Purchase Error:', error.message);
    return res.status(400).json({ message: error.message });
  }
};
