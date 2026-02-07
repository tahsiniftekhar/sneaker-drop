const express = require('express');
const router = express.Router();
const ReservationController = require('../controllers/ReservationController');

router.post('/', ReservationController.reserveItem);

module.exports = router;
