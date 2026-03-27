const Request = require('../models/Request');
const Notification = require('../models/Notification');
const Skill = require('../models/Skill');
const Session = require('../models/Session');

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

// @desc    Create a new learning request
exports.createRequest = async (req, res) => {
    try {
        const { skill_id, teacher_id, message, preferred_date } = req.body;

        if (!skill_id || !teacher_id || !message || !preferred_date) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        if (teacher_id.toString() === req.user._id.toString()) {
            return res.status(400).json({ message: 'You cannot request your own skill.' });
        }

        const preferredDate = new Date(preferred_date);
        if (Number.isNaN(preferredDate.getTime())) {
            return res.status(400).json({ message: 'Preferred date is invalid.' });
        }

        const skill = await Skill.findById(skill_id).select('user_id skill_name');
        if (!skill) {
            return res.status(404).json({ message: 'Selected skill not found.' });
        }

        if (skill.user_id.toString() !== teacher_id.toString()) {
            return res.status(400).json({ message: 'Selected teacher does not match this skill.' });
        }

        const duplicatePending = await Request.findOne({
            skill_id,
            student_id: req.user._id,
            teacher_id,
            status: 'Pending'
        });
        if (duplicatePending) {
            return res.status(400).json({ message: 'You already have a pending request for this skill.' });
        }

        const request = await Request.create({
            skill_id,
            student_id: req.user._id,
            teacher_id,
            message: message.trim(),
            preferred_date: preferredDate
        });

        // Create notification for teacher
        await Notification.create({
            user_id: teacher_id,
            type: 'learning_request',
            message: `${req.user.name} requested to learn ${skill.skill_name}.`
        });

        res.status(201).json(request);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating request. Please try again.' });
    }
};

// @desc    Get incoming learning requests for teacher
exports.getIncomingRequests = async (req, res) => {
    try {
        const requests = await Request.find({ teacher_id: req.user._id })
            .populate('student_id', 'name email department campus')
            .populate('skill_id', 'skill_name')
            .sort({ createdAt: -1 });

        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching incoming requests' });
    }
};

// @desc    Get sent learning requests for student
exports.getSentRequests = async (req, res) => {
    try {
        const requests = await Request.find({ student_id: req.user._id })
            .populate('teacher_id', 'name email department campus')
            .populate('skill_id', 'skill_name')
            .sort({ createdAt: -1 });

        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sent requests' });
    }
};

// @desc    Accept a learning request
exports.acceptRequest = async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) return res.status(404).json({ message: 'Request not found' });
        
        if (request.teacher_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        request.status = 'Accepted';
        await request.save();

        // Ensure an actual session exists immediately after acceptance
        const existingSession = await Session.findOne({ request_id: request._id });
        if (!existingSession) {
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

        // Create notification for learner
        await Notification.create({
            user_id: request.student_id,
            type: 'request_accepted',
            message: `Your request was accepted by the teacher.`
        });

        res.json(request);
    } catch (error) {
        res.status(500).json({ message: 'Error accepting request' });
    }
};

// @desc    Reject a learning request
exports.rejectRequest = async (req, res) => {
    try {
        const request = await Request.findById(req.params.id);
        if (!request) return res.status(404).json({ message: 'Request not found' });
        
        if (request.teacher_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        request.status = 'Rejected';
        await request.save();

        // Create notification for learner
        await Notification.create({
            user_id: request.student_id,
            type: 'request_rejected',
            message: `Your request was rejected by the teacher.`
        });

        res.json(request);
    } catch (error) {
        res.status(500).json({ message: 'Error rejecting request' });
    }
};
