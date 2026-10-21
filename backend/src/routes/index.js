const express = require('express');
const router = express.Router();
const dropRoutes = require('./dropRoutes');
const reservationRoutes = require('./reservationRoutes');
const purchaseRoutes = require('./purchaseRoutes')
const userRoutes = require('./userRoutes')

router.get('/health', async (req, res) => {
  try {
    res.json({ status: 'success', message: 'API is operational' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// routes
// DEMO ONLY: there is no authentication. Reservation and purchase endpoints trust the userId in the
// request body, so any client can act as any user. Put real auth in front of these before using
// them with real users.
router.use('/drops', dropRoutes);
router.use('/reservations', reservationRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/users', userRoutes);

module.exports = router;
