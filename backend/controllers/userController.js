const User = require('../models/User');

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve profile' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { name, department, year, bio, campus } = req.body;
        const updates = {};

        if (typeof name !== 'undefined') updates.name = String(name).trim();
        if (typeof campus !== 'undefined') updates.campus = String(campus).trim();
        if (typeof year !== 'undefined') updates.year = String(year).trim();
        if (typeof bio !== 'undefined') updates.bio = String(bio).trim();
        if (typeof department !== 'undefined') {
            const normalizedDepartment = String(department).trim();
            updates.department = normalizedDepartment || undefined;
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $set: updates },
            {
                new: true,
                runValidators: true,
                context: 'query',
                select: '-password'
            }
        );
        if (!updatedUser) return res.status(404).json({ message: 'User not found' });

        res.json({
            id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            department: updatedUser.department,
            year: updatedUser.year,
            bio: updatedUser.bio,
            campus: updatedUser.campus
        });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Failed to update profile' });
    }
};

exports.getLeaderboard = async (req, res) => {
    try {
        const topTeachers = await User.find({ rating: { $gt: 0 } })
            .select('name rating department campus sessions_completed profile_image')
            .sort({ rating: -1, sessions_completed: -1 })
            .limit(10);
        
        res.json(topTeachers);
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve leaderboard' });
    }
};
