const express = require('express');
const router = express.Router();
const { getAllUsers, deleteUser, getAllSessions, getAllCredits, getAllFeedback, getStats, getAllSkills } = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.use(protect);
router.use(adminOnly);

router.get('/users', getAllUsers);
router.delete('/users/:id', deleteUser);
router.get('/skills', getAllSkills);
router.get('/sessions', getAllSessions);
router.get('/credits', getAllCredits);
router.get('/feedback', getAllFeedback);
router.get('/stats', getStats);

module.exports = router;
