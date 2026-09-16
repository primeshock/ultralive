const express = require('express');
const { Poll, PollResponse } = require('../models/Poll');
const { checkStudentAccess } = require('../utils/checkStudentAccess');
const { COOKIE_NAME, verifyToken } = require('../utils/jwt');

const router = express.Router();

async function getIdentity(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const { sub } = verifyToken(token);
      return { userId: `staff:${sub}`, isStaff: true };
    } catch {
      /* fall through to the student session */
    }
  }
  const access = await checkStudentAccess(req.params.channel.toLowerCase(), req.cookies || {});
  return { userId: access.externalUserId, isStaff: false };
}

router.get('/:channel/polls/active', async (req, res) => {
  let identity;
  try {
    identity = await getIdentity(req);
  } catch {
    return res.status(401).json({ error: 'دسترسی ندارید.' });
  }
  const poll = await Poll.findOne({ channel: req.params.channel.toLowerCase() }).sort({ createdAt: -1 });
  if (!poll || !poll.isOpen) return res.json(null);
  const response = {
    id: poll._id,
    question: poll.question,
    mode: poll.mode,
    options: poll.options.map((o) => ({
      id: o._id,
      text: o.text,
      isCorrect: poll.mode === 'quiz' && poll.isEffectivelyRevealed() ? o.isCorrect : undefined,
    })),
    isOpen: poll.isEffectivelyOpen(),
    showResults: poll.showResults,
    closesAt: poll.closesAt,
    revealAt: poll.revealAt,
    revealed: poll.isEffectivelyRevealed(),
  };
  const previousVote = await PollResponse.findOne({ pollId: poll._id, userId: identity.userId }).select('optionId');
  response.votedOptionId = previousVote?.optionId || null;
  if (poll.showResults || (poll.mode === 'quiz' && poll.isEffectivelyRevealed())) {
    const counts = await PollResponse.aggregate([
      { $match: { pollId: poll._id } },
      { $group: { _id: '$optionId', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((item) => [String(item._id), item.count]));
    response.results = poll.options.map((option) => ({
      id: option._id,
      text: option.text,
      count: countMap[String(option._id)] || 0,
      isCorrect: poll.isEffectivelyRevealed() ? option.isCorrect : undefined,
    }));
  }
  res.json(response);
});

router.post('/:channel/polls/:pollId/vote', async (req, res) => {
  let identity;
  try {
    identity = await getIdentity(req);
  } catch {
    return res.status(401).json({ error: 'دسترسی ندارید.' });
  }
  const poll = await Poll.findById(req.params.pollId);
  if (!poll || !poll.isOpen) return res.status(400).json({ error: 'این نظرسنجی بسته شده است.' });
  if (!poll.options.some((o) => String(o._id) === req.body?.optionId)) {
    return res.status(400).json({ error: 'گزینه نامعتبر.' });
  }
  const existing = await PollResponse.findOne({ pollId: poll._id, userId: identity.userId });
  if (existing) return res.status(409).json({ error: 'رأی شما قبلاً ثبت شده است.', optionId: existing.optionId });
  await PollResponse.create({ pollId: poll._id, userId: identity.userId, optionId: req.body.optionId });
  res.status(201).json({ optionId: req.body.optionId });
});

module.exports = router;
