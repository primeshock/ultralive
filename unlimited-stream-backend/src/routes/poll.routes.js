const express = require('express');
const { Poll, PollResponse } = require('../models/Poll');

const router = express.Router();
// Mounted after requireAuth+requireRole('admin','owner') in admin.routes.js (see wiring note).

router.get('/channels/:channel/polls', async (req, res) => {
  const polls = await Poll.find({ channel: req.params.channel.toLowerCase() }).sort({ createdAt: -1 }).limit(50);
  res.json(polls);
});

router.post('/channels/:channel/polls', async (req, res) => {
  const { question, mode, options, timerSeconds, revealAt } = req.body || {};
  if (!question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'سوال و حداقل دو گزینه لازم است.' });
  }
  const poll = await Poll.create({
    channel: req.params.channel.toLowerCase(),
    question,
    mode: mode === 'quiz' ? 'quiz' : 'poll',
    options,
    closesAt: timerSeconds ? new Date(Date.now() + timerSeconds * 1000) : null,
    revealAt: revealAt ? new Date(revealAt) : null,
    createdBy: String(req.user._id),
  });
  res.status(201).json(poll);
});

router.post('/polls/:pollId/options', async (req, res) => {
  const { text, isCorrect } = req.body || {};
  const poll = await Poll.findByIdAndUpdate(
    req.params.pollId,
    { $push: { options: { text, isCorrect: Boolean(isCorrect) } } },
    { new: true }
  );
  res.json(poll);
});

router.post('/polls/:pollId/close', async (req, res) => {
  res.json(await Poll.findByIdAndUpdate(req.params.pollId, { isOpen: false }, { new: true }));
});

router.post('/polls/:pollId/reveal', async (req, res) => {
  res.json(await Poll.findByIdAndUpdate(req.params.pollId, { revealed: true }, { new: true }));
});

// "ریست گزینه‌ها": clears all votes, keeps the poll open for a re-vote.
router.post('/polls/:pollId/reset', async (req, res) => {
  await PollResponse.deleteMany({ pollId: req.params.pollId });
  res.json(await Poll.findByIdAndUpdate(req.params.pollId, { isOpen: true, revealed: false }, { new: true }));
});

router.get('/polls/:pollId/results', async (req, res) => {
  const poll = await Poll.findById(req.params.pollId);
  if (!poll) return res.status(404).json({ error: 'یافت نشد.' });

  const counts = await PollResponse.aggregate([
    { $match: { pollId: poll._id } },
    { $group: { _id: '$optionId', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));

  res.json({
    question: poll.question,
    mode: poll.mode,
    isOpen: poll.isEffectivelyOpen(),
    revealed: poll.isEffectivelyRevealed(),
    results: poll.options.map((o) => ({
      optionId: o._id,
      text: o.text,
      isCorrect: poll.isEffectivelyRevealed() ? o.isCorrect : undefined,
      count: countMap[String(o._id)] || 0,
    })),
  });
});

module.exports = router;
