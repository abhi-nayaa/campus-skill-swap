const Session = require('../models/Session');
const Request = require('../models/Request');
const User = require('../models/User');
const CreditTransaction = require('../models/CreditTransaction');
const Notification = require('../models/Notification');

const CREDIT_AMOUNT_PER_SESSION = 2;

const getAutoScheduleDate = (preferredDateRaw) => {
    let scheduled = preferredDateRaw ? new Date(preferredDateRaw) : new Date();
    if (Number.isNaN(scheduled.getTime())) {
        scheduled = new Date();
    }

    const minimumLead = new Date(Date.now() + 30 * 60 * 1000);
    if (scheduled <= minimumLead) {
        scheduled = minimumLead;
    }

    return scheduled;
};

const transferCreditsForSession = async (session) => {
    const existingCreditTx = await CreditTransaction.findOne({ session_id: session._id });
    if (existingCreditTx) {
        return { transferred: false, alreadyTransferred: true };
    }

    const student = await User.findById(session.student_id).select('credits');
    const teacher = await User.findById(session.teacher_id).select('credits');

    if (!student || !teacher) {
        throw new Error('User not found');
    }

    if (student.credits < CREDIT_AMOUNT_PER_SESSION) {
        throw new Error('Insufficient credits');
    }

    const debitResult = await User.updateOne(
        { _id: student._id, credits: { $gte: CREDIT_AMOUNT_PER_SESSION } },
        { $inc: { credits: -CREDIT_AMOUNT_PER_SESSION } }
    );

    if (!debitResult.modifiedCount) {
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

    await Notification.create({
        user_id: teacher._id,
        type: 'session_completed',
        message: `Learner marked your session as completed. ${CREDIT_AMOUNT_PER_SESSION} credits transferred.`
    });

    return { transferred: true, alreadyTransferred: false };
};

// @desc    Create a new session from an accepted request
exports.createSession = async (req, res) => {
    try {
        const { request_id, skill_id, student_id, mode, location, meet_link, date, time } = req.body;

        if (!request_id || !skill_id || !student_id || !date || !time || !mode) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const request = await Request.findById(request_id);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (request.teacher_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only the teacher can schedule this session' });
        }

        if (request.status !== 'Accepted') {
            return res.status(400).json({ message: 'Request must be accepted before scheduling a session' });
        }

        const existing = await Session.findOne({ request_id });
        if (existing) {
            return res.status(400).json({ message: 'Session already created for this request' });
        }

        if (mode === 'Online' && !meet_link) {
            return res.status(400).json({ message: 'Meet link is required for online sessions' });
        }

        if (mode === 'Offline' && !location) {
            return res.status(400).json({ message: 'Location is required for offline sessions' });
        }

        const scheduledDate = new Date(`${date}T${time}`);
        if (Number.isNaN(scheduledDate.getTime())) {
            return res.status(400).json({ message: 'Invalid session date/time' });
        }

        if (scheduledDate <= new Date()) {
            return res.status(400).json({ message: 'Session must be scheduled for a future date/time' });
        }

        const session = await Session.create({
            request_id,
            teacher_id: req.user._id,
            student_id,
            skill_id,
            mode,
            location: mode === 'Offline' ? location : '',
            meet_link: mode === 'Online' ? meet_link : '',
            date: scheduledDate,
            time
        });

        await Notification.create({
            user_id: student_id,
            type: 'session_scheduled',
            message: `Your ${mode.toLowerCase()} session has been scheduled for ${new Date(date).toLocaleDateString()} at ${time}.`
        });

        res.status(201).json(session);
    } catch (error) {
        res.status(500).json({ message: error.message || 'Error creating session' });
    }
};

// @desc    Get all sessions for user
exports.getSessions = async (req, res) => {
    try {
        const relevantAcceptedRequests = await Request.find({
            status: 'Accepted',
            $or: [{ teacher_id: req.user._id }, { student_id: req.user._id }]
        }).select('_id teacher_id student_id skill_id preferred_date');

        for (const request of relevantAcceptedRequests) {
            const exists = await Session.exists({ request_id: request._id });
            if (exists) continue;

            const scheduledDate = getAutoScheduleDate(request.preferred_date);
            const hh = String(scheduledDate.getHours()).padStart(2, '0');
            const mm = String(scheduledDate.getMinutes()).padStart(2, '0');

            await Session.create({
                request_id: request._id,
                teacher_id: request.teacher_id,
                student_id: request.student_id,
                skill_id: request.skill_id,
                mode: 'Online',
                meet_link: 'https://meet.google.com/new',
                location: '',
                date: scheduledDate,
                time: `${hh}:${mm}`,
                status: 'Scheduled'
            });
        }

        const sessions = await Session.find({
            $or: [{ teacher_id: req.user._id }, { student_id: req.user._id }]
        })
            .populate('teacher_id student_id', 'name email')
            .populate('skill_id', 'skill_name')
            .sort({ date: 1, createdAt: -1 });

        res.json(sessions);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sessions' });
    }
};

// @desc    Complete a session and transfer credits
exports.completeSession = async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        if (session.student_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only the learner can mark a session as completed' });
        }

        if (session.status === 'Cancelled') {
            return res.status(400).json({ message: 'Cancelled session cannot be completed' });
        }

        if (session.status === 'Scheduled') {
            session.status = 'Completed';
            await session.save();
        }

        const transferResult = await transferCreditsForSession(session);
        if (transferResult.alreadyTransferred) {
            return res.json({ message: 'Session already completed and credits were already transferred' });
        }

        res.json({ message: 'Session completed and credits transferred (+2 to teacher, -2 from learner)' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
