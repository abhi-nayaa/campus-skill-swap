const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    request_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Request',
        required: true,
        index: true
    },
    teacher_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    student_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    skill_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Skill',
        required: true
    },
    mode: {
        type: String,
        enum: ['Online', 'Offline'],
        required: true
    },
    meet_link: { type: String },
    location: { type: String },
    date: { 
        type: Date, 
        required: true,
        validate: { 
            validator: function(v) { return v && v > Date.now(); }, 
            message: 'Session date must be in the future' 
        }
    },
    time: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['Scheduled', 'Completed', 'Cancelled'], 
        default: 'Scheduled' 
    }
}, { timestamps: true });

const Session = mongoose.model('Session', sessionSchema);
module.exports = Session;
