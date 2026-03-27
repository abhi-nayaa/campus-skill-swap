const express = require('express');
const router = express.Router();
const { createRequest, getIncomingRequests, getSentRequests, acceptRequest, rejectRequest } = require('../controllers/requestController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, createRequest);
router.get('/incoming', protect, getIncomingRequests);
router.get('/sent', protect, getSentRequests);
router.patch('/:id/accept', protect, acceptRequest);
router.patch('/:id/reject', protect, rejectRequest);

module.exports = router;
