const express = require('express');
const { Poll, PollResponse } = require('../models/Poll');
const { checkStudentAccess } = require('../utils/checkStudentAccess');
const { COOKIE_NAME, verifyToken } = require('../utils/jwt');
const { canAccessClass } = require('../utils/classAccess');
const { cookieSecure } = require('../config/env');

const router = express.Router();

async function getIdentity(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const { sub } = verifyToken(token);
      return { userId: `staff:${sub}`, isStaff: true };
    } catch {
      /* fall through to the student session */
    }
  }
  const channel = req.params.channel.toLowerCase();
  try {
    const access = await checkStudentAccess(channel, req.cookies || {});
    return { userId: access.externalUserId, isStaff: false };
  } catch { /* not a room-session student: maybe a public-link guest */ }
  if (await canAccessClass(channel, req.cookies || {})) {
    // guests have no account: give each browser its own stable id so every guest can vote once
    const { readGuest, writeGuest, newGuestId } = require('../utils/publicGuest');
    let guest = readGuest(req.cookies, channel);
    if (!guest) { guest = { id: newGuestId(), name: '' }; writeGuest(res, channel, guest); }
    const id = guest.id;
    return { userId: `guest:${id}`, isStaff: false };
  }
  throw new Error('no access');
}

router.get('/:channel/polls/active', async (req, res) => {
  let identity;
  try {
    identity = await getIdentity(req, res);
  } catch {
    return res.status(401).json({ error: 'دسترسی ندارید.' });
  }
  const poll = await Poll.findOne({ channel: req.params.channel.toLowerCase() }).sort({ createdAt: -1 });
  if (!poll) return res.json(null);
  // a finished poll stays visible (as results) while the host shows results / has revealed the answer
  if (!poll.isOpen && !(poll.showResults || (poll.mode === 'quiz' && poll.isEffectivelyRevealed()))) return res.json(null);
  const votingOpen = poll.isEffectivelyOpen();
  const serverNow = Date.now();
  const response = {
    id: poll._id,
    question: poll.question,
    mode: poll.mode,
    options: poll.options.map((o) => ({
      id: o._id,
      text: o.text,
      isCorrect: poll.mode === 'quiz' && poll.isEffectivelyRevealed() ? o.isCorrect : undefined,
    })),
    isOpen: poll.isOpen,
    votingOpen,
    serverNow,
    remainingSeconds: poll.closesAt ? Math.max(0, Math.ceil((poll.closesAt.getTime() - serverNow) / 1000)) : null,
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
    identity = await getIdentity(req, res);
  } catch {
    return res.status(401).json({ error: 'دسترسی ندارید.' });
  }
  const poll = await Poll.findById(req.params.pollId);
  if (!poll || !poll.isOpen) return res.status(400).json({ error: 'این نظرسنجی بسته شده است.' });
  if (!poll.isEffectivelyOpen()) return res.status(400).json({ error: 'مهلت پاسخ‌گویی تمام شده است.' });
  if (!poll.options.some((o) => String(o._id) === req.body?.optionId)) {
    return res.status(400).json({ error: 'گزینه نامعتبر.' });
  }
  const existing = await PollResponse.findOne({ pollId: poll._id, userId: identity.userId });
  if (existing) return res.status(409).json({ error: 'رأی شما قبلاً ثبت شده است.', optionId: existing.optionId });
  await PollResponse.create({ pollId: poll._id, userId: identity.userId, optionId: req.body.optionId });
  res.status(201).json({ optionId: req.body.optionId });
});

module.exports = router;
