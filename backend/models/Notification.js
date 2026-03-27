const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    type: { 
        type: String, 
        enum: ['learning_request', 'request_accepted', 'request_rejected', 'session_reminder', 'session_completed'], 
        required: true 
    },
    message: { type: String, required: true },
    is_read: { type: Boolean, default: false }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
