const User = require('../models/User');
const bcrypt = require('bcryptjs');

const createDefaultAdmin = async () => {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        
        if (!adminExists) {
            console.log('No admin found. Creating default admin account...');
            
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('Admin@123', salt);
            
            await User.create({
                name: 'System Admin',
                email: 'admin@skillswap.com',
                password: hashedPassword,
                phone: '0000000000',
                role: 'admin',
                credits: 999,
                bio: 'System Administrator'
            });
            
            console.log('Default admin created: admin@skillswap.com / Admin@123');
        } else {
            console.log('Admin account already exists.');
        }
    } catch (error) {
        console.error('Error creating default admin:', error.message);
    }
};

module.exports = createDefaultAdmin;
