const User = require('../models/User');
const Skill = require('../models/Skill');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { 
    validateEmail, 
    validatePassword, 
    validatePhone, 
    validateName, 
    validateCampus, 
    validateDepartment, 
    validateYear, 
    validateBio,
    validateSkillLevel
} = require('../utils/validators');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'campus_skill_swap_secret_key_2026', {
        expiresIn: '30d'
    });
};

exports.registerUser = async (req, res) => {
    try {
        const { name, email, password, campus, department, year, bio, contact, profile_image, skills } = req.body;
        const normalizedDepartment = typeof department === 'string' ? department.trim() : '';
        const normalizedYear = typeof year === 'string' ? year.trim() : '';
        const normalizedBio = typeof bio === 'string' ? bio.trim() : '';

        // Basic presence validation
        if (!name || !email || !password || !campus || !contact) {
            return res.status(400).json({ message: 'Please provide all required fields' });
        }

        // Detailed attribute validation
        if (!validateName(name)) {
            return res.status(400).json({ message: 'Name must be between 2 and 50 characters' });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({ message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character' });
        }

        if (!validatePhone(contact)) {
            return res.status(400).json({ message: 'Phone number must be exactly 10 digits' });
        }

        if (!validateCampus(campus)) {
            return res.status(400).json({ message: 'Campus name must be between 3 and 100 characters' });
        }

        if (!validateDepartment(normalizedDepartment)) {
            return res.status(400).json({ message: 'Department name must be between 2 and 100 characters' });
        }

        if (!validateYear(normalizedYear)) {
            return res.status(400).json({ message: 'Year description is too long' });
        }

        if (!validateBio(normalizedBio)) {
            return res.status(400).json({ message: 'Bio cannot exceed 500 characters' });
        }

        // Skill validation
        let validatedSkills = [];
        if (skills && Array.isArray(skills)) {
            for (const skill of skills) {
                if (!skill.name || skill.name.trim().length < 2 || skill.name.trim().length > 50) {
                    return res.status(400).json({ message: `Invalid skill name: ${skill.name || 'empty'}` });
                }
                if (!validateSkillLevel(skill.level)) {
                    return res.status(400).json({ message: `Invalid skill level for ${skill.name}: ${skill.level}` });
                }
                validatedSkills.push({ name: skill.name.trim(), level: skill.level });
            }
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            phone: contact,
            campus,
            department: normalizedDepartment || undefined,
            year: normalizedYear || '',
            bio: normalizedBio || '',
            profile_image,
            skills: validatedSkills,
            credits: 10
        });

        // Keep the dedicated Skill collection in sync so Browse Skills can show
        // skills added during registration.
        if (validatedSkills.length > 0) {
            const skillDocs = validatedSkills.map((skill) => ({
                user_id: user._id,
                skill_name: skill.name,
                category: 'General',
                level: skill.level,
                description: `${skill.name} lessons shared by ${user.name}.`,
                credits_required: 1,
                mode: 'Online'
            }));
            await Skill.insertMany(skillDocs, { ordered: false }).catch(() => {});
        }

        res.status(201).json({
            token: generateToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                credits: user.credits,
                role: user.role
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({
                token: generateToken(user._id),
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    credits: user.credits,
                    role: user.role
                }
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server error during login' });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        // Simulating a real reset logic
        res.json({ message: 'Instructions have been sent to your email.' });
    } catch (error) {
        res.status(500).json({ message: 'Error processing forgot password' });
    }
};
