const Skill = require('../models/Skill');
const User = require('../models/User');
const Feedback = require('../models/Feedback');

async function syncEmbeddedUserSkillsToSkillCollection() {
    const usersWithSkills = await User.find({ skills: { $exists: true, $not: { $size: 0 } } })
        .select('name skills');

    if (!usersWithSkills.length) return;

    const bulkOps = [];

    for (const user of usersWithSkills) {
        for (const embeddedSkill of user.skills) {
            const skillName = embeddedSkill?.name?.trim();
            const level = embeddedSkill?.level;
            if (!skillName || !level) continue;

            bulkOps.push({
                updateOne: {
                    filter: {
                        user_id: user._id,
                        skill_name: skillName,
                        level
                    },
                    update: {
                        $setOnInsert: {
                            category: 'General',
                            description: `${skillName} lessons shared by ${user.name}.`,
                            credits_required: 1,
                            mode: 'Online',
                            popularity: 0
                        }
                    },
                    upsert: true
                }
            });
        }
    }

    if (bulkOps.length) {
        await Skill.bulkWrite(bulkOps, { ordered: false });
    }
}

// @desc    Get all skills with pagination and recommendation
exports.getAllSkills = async (req, res) => {
    try {
        await syncEmbeddedUserSkillsToSkillCollection();

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;
        const excludeMine = req.query.excludeMine === 'true';

        const query = {};
        if (req.user && excludeMine) {
            query.user_id = { $ne: req.user._id };
        }
        if (req.query.search) {
            query.$or = [
                { skill_name: { $regex: req.query.search, $options: 'i' } },
                { category: { $regex: req.query.search, $options: 'i' } },
                { description: { $regex: req.query.search, $options: 'i' } }
            ];
        }
        if (req.query.category) {
            query.category = req.query.category;
        }
        if (req.query.mode && req.query.mode !== 'Both') {
            query.mode = req.query.mode;
        }

        const total = await Skill.countDocuments(query);
        const rawSkills = await Skill.find(query)
            .populate('user_id', 'name rating profile_image')
            .sort({ popularity: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const teacherIds = rawSkills
            .map((skill) => skill.user_id?._id)
            .filter(Boolean);

        const [feedbackSummaryRows, latestFeedbackRows] = await Promise.all([
            Feedback.aggregate([
                { $match: { teacher_id: { $in: teacherIds } } },
                {
                    $group: {
                        _id: '$teacher_id',
                        avgRating: { $avg: '$rating' },
                        reviewCount: { $sum: 1 }
                    }
                }
            ]),
            Feedback.aggregate([
                { $match: { teacher_id: { $in: teacherIds }, review: { $exists: true, $ne: '' } } },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: '$teacher_id',
                        latestReview: { $first: '$review' }
                    }
                }
            ])
        ]);

        const feedbackSummaryMap = new Map(
            feedbackSummaryRows.map((row) => [
                row._id.toString(),
                {
                    avgRating: Number(row.avgRating || 0).toFixed(1),
                    reviewCount: row.reviewCount || 0
                }
            ])
        );

        const latestReviewMap = new Map(
            latestFeedbackRows.map((row) => [row._id.toString(), row.latestReview])
        );

        const skills = rawSkills.map((skillDoc) => {
            const skill = skillDoc.toObject();
            const teacherId = skill.user_id?._id?.toString();
            const summary = teacherId ? feedbackSummaryMap.get(teacherId) : null;
            const latestReview = teacherId ? latestReviewMap.get(teacherId) : null;

            skill.feedbackSummary = {
                avgRating: summary?.avgRating || (skill.user_id?.rating ? Number(skill.user_id.rating).toFixed(1) : "0.0"),
                reviewCount: summary?.reviewCount || 0,
                latestReview: latestReview || null
            };
            return skill;
        });

        res.json({
            skills,
            total,
            page,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching skills' });
    }
};

// @desc    Get top categories
exports.getCategories = async (req, res) => {
    try {
        const categories = await Skill.distinct('category');
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching categories' });
    }
};

// @desc    Add a new skill
exports.addSkill = async (req, res) => {
    try {
        const { skill_name, category, level, description, credits_required, mode } = req.body;
        
        if (!skill_name || !category || !level) {
            return res.status(400).json({ message: 'Please provide required fields' });
        }

        const newSkill = await Skill.create({
            user_id: req.user._id,
            skill_name,
            category,
            level,
            description,
            credits_required: credits_required || 1,
            mode: mode || 'Online'
        });

        res.status(201).json(newSkill);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error adding skill' });
    }
};

// @desc    Get skills created by logged in user
exports.getMySkills = async (req, res) => {
    try {
        const skills = await Skill.find({ user_id: req.user._id });
        res.json(skills);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching your skills' });
    }
};
// @desc    Update a skill
exports.updateSkill = async (req, res) => {
    try {
        const { skill_name, category, level, description, credits_required, mode } = req.body;
        const skill = await Skill.findById(req.params.id);

        if (!skill) {
            return res.status(404).json({ message: 'Skill not found' });
        }

        // Check ownership
        if (skill.user_id.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'User not authorized to update this skill' });
        }

        skill.skill_name = skill_name || skill.skill_name;
        skill.category = category || skill.category;
        skill.level = level || skill.level;
        skill.description = description || skill.description;
        skill.credits_required = credits_required || skill.credits_required;
        skill.mode = mode || skill.mode;

        const updatedSkill = await skill.save();
        res.json(updatedSkill);
    } catch (error) {
        res.status(500).json({ message: 'Error updating skill' });
    }
};

// @desc    Delete a skill
exports.deleteSkill = async (req, res) => {
    try {
        const skill = await Skill.findById(req.params.id);

        if (!skill) {
            return res.status(404).json({ message: 'Skill not found' });
        }

        // Check ownership
        if (skill.user_id.toString() !== req.user._id.toString()) {
            return res.status(401).json({ message: 'User not authorized to delete this skill' });
        }

        await skill.deleteOne();
        res.json({ message: 'Skill removed' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting skill' });
    }
};
