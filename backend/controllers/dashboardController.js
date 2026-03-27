const User = require('../models/User');
const Skill = require('../models/Skill');
const Request = require('../models/Request');
const Session = require('../models/Session');
const Feedback = require('../models/Feedback');
const CreditTransaction = require('../models/CreditTransaction');

const CREDIT_AMOUNT_PER_SESSION = 2;

const reconcileSessionCreditsForUser = async (userId) => {
    const sessions = await Session.find({
        $or: [{ teacher_id: userId }, { student_id: userId }],
        status: 'Completed'
    }).select('_id teacher_id student_id').lean();

    for (const session of sessions) {
        const existingTx = await CreditTransaction.findOne({ session_id: session._id }).select('_id').lean();
        if (existingTx) continue;

        const debit = await User.updateOne(
            { _id: session.student_id, credits: { $gte: CREDIT_AMOUNT_PER_SESSION } },
            { $inc: { credits: -CREDIT_AMOUNT_PER_SESSION } }
        );

        if (!debit.modifiedCount) continue;

        await User.updateOne(
            { _id: session.teacher_id },
            { $inc: { credits: CREDIT_AMOUNT_PER_SESSION } }
        );

        await CreditTransaction.create({
            from_user: session.student_id,
            to_user: session.teacher_id,
            amount: CREDIT_AMOUNT_PER_SESSION,
            reason: 'Credit transfer for completed session',
            session_id: session._id
        });
    }
};

// @desc    Get summary data for the dashboard
exports.getDashboardData = async (req, res) => {
    try {
        const userId = req.user._id;
        await reconcileSessionCreditsForUser(userId);

        const user = await User.findById(userId).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const skillsLearningCursor = await Session.find({ student_id: userId, status: 'Scheduled' })
            .populate('teacher_id', 'name email')
            .populate('skill_id', 'skill_name')
            .lean();

        const pendingRequests = await Request.find({ teacher_id: userId, status: 'Pending' })
            .populate('student_id', 'name email')
            .populate('skill_id', 'skill_name')
            .lean();

        const upcomingSessions = await Session.find({ 
            $or: [{ teacher_id: userId }, { student_id: userId }],
            status: 'Scheduled'
        }).populate('teacher_id student_id', 'name email').populate('skill_id', 'skill_name').lean();

        const creditHistoryCursor = await CreditTransaction.find({ 
            $or: [{ from_user: userId }, { to_user: userId }] 
        }).sort({ createdAt: -1 }).limit(10).lean();

        const creditHistory = creditHistoryCursor.map(t => ({
            amount: t.amount,
            reason: t.reason,
            type: t.to_user?.toString() === userId.toString() ? "positive" : "negative",
            date: t.createdAt
        }));

        const feedbackHistoryCursor = await Feedback.find({
            $or: [{ student_id: userId }, { teacher_id: userId }]
        })
            .populate('student_id teacher_id', 'name')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        const feedbackHistory = feedbackHistoryCursor.map((f) => {
            const isGivenByUser = f.student_id?._id?.toString() === userId.toString();
            return {
                rating: f.rating,
                review: f.review,
                date: f.createdAt,
                type: isGivenByUser ? 'given' : 'received',
                counterpart: isGivenByUser ? (f.teacher_id?.name || 'Unknown') : (f.student_id?.name || 'Unknown')
            };
        });

        res.json({
            user,
            skillsLearning: skillsLearningCursor,
            pendingRequests,
            upcomingSessions: upcomingSessions.map(s => {
                const isTeacher = s.teacher_id._id.toString() === userId.toString();
                return {
                    _id: s._id,
                    skill: s.skill_id?.skill_name || 'Deleted Skill',
                    partnerName: isTeacher ? s.student_id.name : s.teacher_id.name,
                    date: s.date,
                    time: s.time,
                    role: isTeacher ? 'Teacher' : 'Learner',
                    status: s.status,
                    meet_link: s.meet_link,
                    location: s.location
                };
            }),
            creditHistory,
            feedbackHistory
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error retrieving dashboard data' });
    }
};
