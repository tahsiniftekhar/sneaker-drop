const express = require('express');
const router = express.Router();
const DropController = require('../controllers/DropController');

router.post('/', DropController.createDrop);
router.get('/', DropController.getAllDrops);

module.exports = router;
