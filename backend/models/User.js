const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Skill name is required'],
        minlength: [2, 'Skill name must be at least 2 characters'],
        maxlength: [50, 'Skill name cannot exceed 50 characters']
    },
    level: {
        type: String,
        enum: {
            values: ['Beginner', 'Intermediate', 'Advanced'],
            message: 'Level must be Beginner, Intermediate, or Advanced'
        },
        required: [true, 'Skill level is required']
    }
});

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Full name is required'],
        minlength: [2, 'Name must be at least 2 characters'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email address is required'],
        unique: true,
        index: true,
        match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please supply a valid email address']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters long']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        match: [/^\d{10}$/, 'Phone number must be exactly 10 digits']
    },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    credits: { type: Number, default: 10, min: [0, 'Credits cannot be negative'] },
    profile_image: { type: String },
    bio: {
        type: String,
        maxlength: [500, 'Bio cannot exceed 500 characters']
    },
    campus: {
        type: String,
        required: [true, 'Campus is required'],
        minlength: [3, 'Campus name must be at least 3 characters'],
        maxlength: [100, 'Campus name cannot exceed 100 characters']
    },
    department: {
        type: String,
        trim: true,
        set: (value) => {
            if (typeof value !== 'string') return value;
            const normalized = value.trim();
            return normalized.length ? normalized : undefined;
        },
        maxlength: [100, 'Department name cannot exceed 100 characters'],
        validate: {
            validator: function (value) {
                return !value || value.length >= 2;
            },
            message: 'Department name must be at least 2 characters'
        }
    },
    year: {
        type: String,
        maxlength: [20, 'Year description is too long']
    },
    skills: [skillSchema]
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
module.exports = User;
