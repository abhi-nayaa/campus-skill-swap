const CreditTransaction = require('../models/CreditTransaction');
const User = require('../models/User');

exports.getHistory = async (req, res) => {
    try {
        const history = await CreditTransaction.find({ 
            $or: [{ from_user: req.user._id }, { to_user: req.user._id }] 
        }).sort({ createdAt: -1 });
        const user = await User.findById(req.user._id).select('credits');
        
        res.json({
            credits: user.credits,
            history
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve credit history' });
    }
};
