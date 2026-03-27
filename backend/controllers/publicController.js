const User = require('../models/User');
const Session = require('../models/Session');
const Skill = require('../models/Skill');

exports.getPublicStats = async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const sessionCount = await Session.countDocuments();
        const skillCount = await Skill.countDocuments();
        
        const topSkills = await Skill.find().sort({ popularity: -1 }).limit(3).populate('user_id', 'name rating');

        res.json({
            userCount,
            sessionCount,
            skillCount,
            topSkills
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching public stats' });
    }
};
