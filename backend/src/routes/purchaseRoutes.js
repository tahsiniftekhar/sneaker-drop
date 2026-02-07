const express = require('express');
const router = express.Router();
const PurchaseController = require('../controllers/PurchaseController');

router.post('/complete', PurchaseController.completePurchase);

module.exports = router;
