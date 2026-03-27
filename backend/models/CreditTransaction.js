const mongoose = require('mongoose');

const creditTransactionSchema = new mongoose.Schema({
    from_user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    to_user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    amount: { 
        type: Number, 
        required: true,
        min: [0, 'Transaction amount cannot be negative']
    },
    reason: { type: String, required: true },
    session_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        index: true
    }
}, { timestamps: true });

const CreditTransaction = mongoose.model('CreditTransaction', creditTransactionSchema);
module.exports = CreditTransaction;
