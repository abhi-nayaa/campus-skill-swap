const Feedback = require('../models/Feedback');
const User = require('../models/User');
const Session = require('../models/Session');
const CreditTransaction = require('../models/CreditTransaction');

const CREDIT_AMOUNT_PER_SESSION = 2;

const transferCreditsIfMissing = async (session) => {
    const existing = await CreditTransaction.findOne({ session_id: session._id });
    if (existing) return;

    const student = await User.findById(session.student_id).select('credits');
    const teacher = await User.findById(session.teacher_id).select('credits');
    if (!student || !teacher) {
        throw new Error('User not found');
    }

    if (student.credits < CREDIT_AMOUNT_PER_SESSION) {
        throw new Error('Insufficient credits');
    }

    const debit = await User.updateOne(
        { _id: student._id, credits: { $gte: CREDIT_AMOUNT_PER_SESSION } },
        { $inc: { credits: -CREDIT_AMOUNT_PER_SESSION } }
    );

    if (!debit.modifiedCount) {
        throw new Error('Insufficient credits');
    }

    await User.updateOne(
        { _id: teacher._id },
        { $inc: { credits: CREDIT_AMOUNT_PER_SESSION } }
    );

    await CreditTransaction.create({
        from_user: student._id,
        to_user: teacher._id,
        amount: CREDIT_AMOUNT_PER_SESSION,
        reason: 'Credit transfer for completed session',
        session_id: session._id
    });
};

// @desc    Submit feedback for a session
exports.submitFeedback = async (req, res) => {
    try {
        const { session_id, rating, review } = req.body;
        
        if (!session_id || !rating || !review) {
            throw new Error('Missing required fields');
        }

        const session = await Session.findById(session_id);
        if (!session) throw new Error('Session not found');

        if (session.status !== 'Completed') {
            throw new Error('Feedback can only be submitted for completed sessions');
        }

        if (session.student_id.toString() !== req.user._id.toString()) {
            throw new Error('Only the learner can submit feedback');
        }

        // Recovery path: if an older flow completed the session but did not transfer credits,
        // perform the transfer once before feedback is saved.
        await transferCreditsIfMissing(session);

        // Check if feedback already exists
        const exists = await Feedback.findOne({ session_id });
        if (exists) throw new Error('Feedback already submitted for this session');

        const feedback = await Feedback.create({
            session_id,
            student_id: req.user._id,
            teacher_id: session.teacher_id,
            rating,
            review
        });

        // Update Teacher Rating
        const ratingAgg = await Feedback.aggregate([
            { $match: { teacher_id: session.teacher_id } },
            { $group: { _id: '$teacher_id', avgRating: { $avg: '$rating' } } }
        ]);
        const avgRating = ratingAgg.length ? ratingAgg[0].avgRating : 0;
        await User.updateOne({ _id: session.teacher_id }, { $set: { rating: avgRating } });

        res.status(201).json({ message: 'Feedback submitted successfully', feedback });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get feedback for a specific teacher
exports.getTeacherFeedback = async (req, res) => {
    try {
        const feedbacks = await Feedback.find({ teacher_id: req.params.teacherId })
            .populate('student_id', 'name profile_image')
            .sort({ createdAt: -1 });
        res.json(feedbacks);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching feedback' });
    }
};
