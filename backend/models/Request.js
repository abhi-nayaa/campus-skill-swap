const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    skill_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
        required: true,
        index: true
    },
    student_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    teacher_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    message: {
        type: String,
        required: true
    },
    preferred_date: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Rejected'],
        default: 'Pending'
    }
}, { timestamps: true });

const Request = mongoose.model('Request', requestSchema);

module.exports = Request;
