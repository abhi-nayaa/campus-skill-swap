const jwt = require('jsonwebtoken');
const Chat = require('./models/Chat');
const Session = require('./models/Session');
const User = require('./models/User');

const socketHandler = (io) => {
    // Middleware for authorization
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error("Authentication error"));

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'campus_skill_swap_secret_key_2026');
            const user = await User.findById(decoded.id).select('-password');
            if (!user) return next(new Error("User not found"));

            socket.user = user;
            next();
        } catch (err) {
            next(new Error("Authentication error"));
        }
    });

    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.user.name} (${socket.id})`);

        // Join a specific session room
        socket.on('join_session_chat', async (sessionId) => {
            try {
                const session = await Session.findById(sessionId);
                if (!session) {
                    return socket.emit('error', { message: 'Session not found' });
                }

                // Security check: Only teacher or student of this session can join
                if (session.teacher_id.toString() !== socket.user._id.toString() && 
                    session.student_id.toString() !== socket.user._id.toString()) {
                    return socket.emit('error', { message: 'You are not part of this session' });
                }

                socket.join(sessionId);
                console.log(`${socket.user.name} joined room: ${sessionId}`);
                
                // Broadcast online status to the room
                socket.to(sessionId).emit('user_status', { userId: socket.user._id, status: 'online' });
            } catch (error) {
                console.error(error);
            }
        });

        // Handle sending a message
        socket.on('send_message', async (data) => {
            const { sessionId, message } = data;
            try {
                const session = await Session.findById(sessionId);
                if (!session) return;

                // Security check
                if (session.teacher_id.toString() !== socket.user._id.toString() && 
                    session.student_id.toString() !== socket.user._id.toString()) {
                    return;
                }

                // Save to database (One document per message in 'Chats' collection)
                const chatMessage = await Chat.create({
                    session_id: sessionId,
                    sender_id: socket.user._id,
                    message: message
                });

                // Broadcast message to room
                io.to(sessionId).emit('receive_message', {
                    sessionId,
                    senderId: socket.user._id,
                    message,
                    timestamp: chatMessage.createdAt,
                    senderName: socket.user.name
                });
            } catch (error) {
                console.error("Socket message error:", error);
            }
        });

        // Typing indicator
        socket.on('typing', (data) => {
            const { sessionId, isTyping } = data;
            socket.to(sessionId).emit('display_typing', { userId: socket.user._id, userName: socket.user.name, isTyping });
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.name}`);
        });
    });
};

module.exports = socketHandler;
