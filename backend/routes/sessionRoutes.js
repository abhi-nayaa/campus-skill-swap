const express = require('express');
const router = express.Router();
const { createSession, getSessions, completeSession } = require('../controllers/sessionController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createSession);
router.get('/my', protect, getSessions);
router.get('/', protect, getSessions);
router.patch('/:id/complete', protect, completeSession);

module.exports = router;
