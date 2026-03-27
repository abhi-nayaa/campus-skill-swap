const express = require('express');
const router = express.Router();
const { getAllSkills, getMySkills, addSkill, updateSkill, deleteSkill } = require('../controllers/skillController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getAllSkills);
router.get('/my', protect, getMySkills);
router.post('/', protect, addSkill);
router.put('/:id', protect, updateSkill);
router.delete('/:id', protect, deleteSkill);

module.exports = router;
