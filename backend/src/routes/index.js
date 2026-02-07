const express = require('express');
const router = express.Router();
const dropRoutes = require('./dropRoutes');
const reservationRoutes = require('./reservationRoutes');
const purchaseRoutes = require('./purchaseRoutes')

router.get('/health', async (req, res) => {
  try {
    res.json({ status: 'success', message: 'API is operational' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// routes
router.use('/drops', dropRoutes);
router.use('/reservations', reservationRoutes);
router.use('/purchases', purchaseRoutes);

module.exports = router;
