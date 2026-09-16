const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema(
  { text: { type: String, required: true }, isCorrect: { type: Boolean, default: false } },
  { _id: true }
);

const pollSchema = new mongoose.Schema(
  {
    channel: { type: String, required: true, lowercase: true, index: true },
    question: { type: String, required: true },
    mode: { type: String, enum: ['poll', 'quiz'], default: 'poll' },
    options: { type: [optionSchema], required: true, validate: (v) => v.length >= 2 },
    isOpen: { type: Boolean, default: true },
    closesAt: { type: Date, default: null }, // voting deadline; null means unlimited
    revealAt: { type: Date, default: null }, // scheduled result/answer reveal (quiz mode)
    revealed: { type: Boolean, default: false }, // manual reveal override
    showResults: { type: Boolean, default: false },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

pollSchema.methods.isEffectivelyOpen = function () {
  return this.isOpen && (!this.closesAt || this.closesAt > new Date());
};
pollSchema.methods.isEffectivelyRevealed = function () {
  return this.revealed || (this.revealAt && this.revealAt <= new Date());
};

const pollResponseSchema = new mongoose.Schema(
  {
    pollId: { type: mongoose.Schema.Types.ObjectId, ref: 'Poll', required: true },
    userId: { type: String, required: true },
    optionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: true }
);
pollResponseSchema.index({ pollId: 1, userId: 1 }, { unique: true });

const Poll = mongoose.model('Poll', pollSchema);
const PollResponse = mongoose.model('PollResponse', pollResponseSchema);
module.exports = { Poll, PollResponse };
