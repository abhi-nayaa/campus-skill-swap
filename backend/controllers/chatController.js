const Chat = require('../models/Chat');
const Session = require('../models/Session');

// @desc    Get chat message history for a session
exports.getChatHistory = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await Session.findById(sessionId);
        if (!session) return res.status(404).json({ message: 'Session not found' });

        // Security: only teacher or learner of this session can see chat
        if (session.teacher_id.toString() !== req.user._id.toString() && 
            session.student_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const messages = await Chat.find({ session_id: sessionId })
            .populate('sender_id', 'name')
            .sort({ createdAt: 1 });
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching chat history' });
    }
};

// @desc    Save chat message (this is used by Socket.io logic frequently)
exports.saveMessage = async (sessionId, senderId, message) => {
    try {
        const chat = await Chat.create({
            session_id: sessionId,
            sender_id: senderId,
            message
        });
        return chat;
    } catch (error) {
        console.error("Chat save error:", error);
    }
};
