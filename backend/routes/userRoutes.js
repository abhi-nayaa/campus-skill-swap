const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, getLeaderboard } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.get('/leaderboard', protect, getLeaderboard);

module.exports = router;
