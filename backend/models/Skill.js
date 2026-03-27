const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  skill_name: {
    type: String,
    required: true,
    index: true,
    trim: true,
    minlength: [3, "Skill name must be at least 3 characters long"]
  },
  category: {
    type: String,
    required: true,
    index: true
  },
  level: {
    type: String,
    enum: ["Beginner", "Intermediate", "Advanced"],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  credits_required: {
    type: Number,
    required: true,
    default: 1,
    min: [1, "Credits required must be at least 1"]
  },
  mode: {
    type: String,
    enum: ["Online", "Offline"],
    default: "Online"
  },
  popularity: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

const Skill = mongoose.model('Skill', skillSchema);
module.exports = Skill;
