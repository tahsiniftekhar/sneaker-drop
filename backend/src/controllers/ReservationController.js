const ReservationService = require('../services/ReservationService');

exports.reserveItem = async (req, res) => {
  const { userId, dropId } = req.body;
  const io = req.app.get('socketio');

  if (!userId || !dropId) {
    return res.status(400).json({
      message: 'Missing required fields: userId and dropId are mandatory.',
    });
  }
  
  try {
    const result = await ReservationService.createAtomicReservation(userId, dropId, io);
    return res.status(201).json(result);
  } catch (error) {
    console.error('Reservation Error:', error.message);
    return res.status(400).json({ message: error.message });
  }
};
