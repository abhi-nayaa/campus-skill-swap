const User = require('../models/User');
const Session = require('../models/Session');
const CreditTransaction = require('../models/CreditTransaction');
const Skill = require('../models/Skill');
const Feedback = require('../models/Feedback');

// @desc    Get all users for admin
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
};

// @desc    Delete user
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (req.user && req.user._id.toString() === user._id.toString()) {
            return res.status(400).json({ message: 'You cannot delete your own active admin account' });
        }

        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting user' });
    }
};

// @desc    Get all sessions for admin
exports.getAllSessions = async (req, res) => {
    try {
        const sessions = await Session.find()
            .populate('teacher_id student_id', 'name email')
            .populate('skill_id', 'skill_name')
            .sort({ createdAt: -1 });
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sessions' });
    }
};

// @desc    Get all credit history for admin
exports.getAllCredits = async (req, res) => {
    try {
        const credits = await CreditTransaction.find()
            .populate('from_user to_user', 'name email')
            .sort({ createdAt: -1 });
        res.json(credits);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching credit history' });
    }
};

// @desc    Get all feedback for admin
exports.getAllFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.find()
            .populate('student_id teacher_id', 'name email')
            .sort({ createdAt: -1 });
        res.json(feedback);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching feedback' });
    }
};

// @desc    Get all skills for management
exports.getAllSkills = async (req, res) => {
    try {
        const skills = await Skill.find().populate('user_id', 'name email');
        res.json(skills);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching skills' });
    }
};

// @desc    Get platform stats
exports.getStats = async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const sessionCount = await Session.countDocuments();
        const skillCount = await Skill.countDocuments();
        const completedSessions = await Session.countDocuments({ status: 'Completed' });
        
        // Detailed reports as requested
        const recentCredits = await CreditTransaction.find().limit(5).sort({ createdAt: -1 }).populate('from_user to_user', 'name');

        res.json({
            userCount,
            sessionCount,
            skillCount,
            completedSessions,
            recentCredits
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching stats' });
    }
};
