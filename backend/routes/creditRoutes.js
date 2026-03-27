const express = require('express');
const router = express.Router();
const { getHistory } = require('../controllers/creditController');
const { protect } = require('../middleware/authMiddleware');

router.get('/history', protect, getHistory);

module.exports = router;
