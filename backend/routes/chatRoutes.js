const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const Session = require('../models/Session');
const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/chat/history/:sessionId
// @desc    Get chat history for a session
router.get('/history/:sessionId', protect, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await Session.findById(sessionId).select('student_id teacher_id');
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }

        const currentUserId = req.user?._id ? req.user._id.toString() : '';
        const studentId = session.student_id ? session.student_id.toString() : '';
        const teacherId = session.teacher_id ? session.teacher_id.toString() : '';

        console.log('[chat-history] ids', {
            loggedInUserId: currentUserId,
            sessionStudentId: studentId,
            sessionTeacherId: teacherId
        });

        if (currentUserId !== studentId && currentUserId !== teacherId) {
            return res.status(403).json({ message: 'Not authorized for this session chat' });
        }
        
        // Find all messages for this session, sorted by time
        const messages = await Chat.find({ session_id: sessionId })
            .populate('sender_id', 'name')
            .sort({ createdAt: 1 });
        
        res.json(messages.map(m => ({
            _id: m._id,
            senderId: m.sender_id?._id || m.sender_id,
            senderName: m.sender_id?.name || 'User',
            message: m.message,
            timestamp: m.createdAt
        })));
    } catch (error) {
        console.error("Chat history error:", error);
        res.status(500).json({ message: 'Error fetching chat history' });
    }
});

module.exports = router;
