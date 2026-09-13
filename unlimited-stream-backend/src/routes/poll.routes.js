const express = require('express');
const { Poll, PollResponse } = require('../models/Poll');

const router = express.Router();

function validChannel(value) {
  return /^[a-z0-9_]{3,24}$/.test(String(value || '').toLowerCase());
}

router.get('/channels/:channel/polls', async (req, res) => {
  if (!validChannel(req.params.channel)) return res.status(400).json({ error: 'کلاس نامعتبر است.' });
  const polls = await Poll.find({ channel: req.params.channel.toLowerCase() }).sort({ createdAt: -1 }).limit(100).lean();
  res.json(polls);
});

router.post('/channels/:channel/polls', async (req, res) => {
  const { question, mode, options, timerSeconds, revealAt } = req.body || {};
  if (!validChannel(req.params.channel) || !question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'سوال و حداقل دو گزینه لازم است.' });
  }
  const cleaned = options
    .map((o) => ({ text: typeof o === 'string' ? o : o?.text, isCorrect: Boolean(o?.isCorrect) }))
    .filter((o) => o.text && String(o.text).trim())
    .slice(0, 12)
    .map((o) => ({ ...o, text: String(o.text).trim().slice(0, 200) }));
  if (cleaned.length < 2) return res.status(400).json({ error: 'حداقل دو گزینه معتبر لازم است.' });
  const poll = await Poll.create({
    channel: req.params.channel.toLowerCase(),
    question: String(question).trim().slice(0, 500),
    mode: mode === 'quiz' ? 'quiz' : 'poll',
    options: cleaned,
    closesAt: timerSeconds ? new Date(Date.now() + Math.max(1, Number(timerSeconds)) * 1000) : null,
    revealAt: revealAt ? new Date(revealAt) : null,
    createdBy: String(req.user._id),
  });
  res.status(201).json(poll);
});

async function getPoll(req, res) {
  const poll = await Poll.findById(req.params.pollId);
  if (!poll) return res.status(404).json({ error: 'نظرسنجی پیدا نشد.' });
  return poll;
}

router.post('/polls/:pollId/options', async (req, res) => {
  const poll = await getPoll(req, res); if (!poll) return;
  const { text, isCorrect } = req.body || {};
  if (!text || poll.options.length >= 12) return res.status(400).json({ error: 'گزینه نامعتبر است.' });
  poll.options.push({ text: String(text).trim().slice(0, 200), isCorrect: Boolean(isCorrect) });
  await poll.save();
  res.json(poll);
});

router.post('/polls/:pollId/close', async (req, res) => {
  const poll = await getPoll(req, res); if (!poll) return;
  poll.isOpen = false; await poll.save(); res.json(poll);
});

router.post('/polls/:pollId/reveal', async (req, res) => {
  const poll = await getPoll(req, res); if (!poll) return;
  poll.revealed = true; await poll.save(); res.json(poll);
});

router.post('/polls/:pollId/reset', async (req, res) => {
  const poll = await getPoll(req, res); if (!poll) return;
  await PollResponse.deleteMany({ pollId: poll._id });
  poll.isOpen = true; poll.revealed = false; poll.closesAt = null; await poll.save();
  res.json(poll);
});

router.get('/polls/:pollId/results', async (req, res) => {
  const poll = await getPoll(req, res); if (!poll) return;
  const counts = await PollResponse.aggregate([
    { $match: { pollId: poll._id } },
    { $group: { _id: '$optionId', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  res.json({
    id: poll._id,
    channel: poll.channel,
    question: poll.question,
    mode: poll.mode,
    isOpen: poll.isEffectivelyOpen(),
    revealed: poll.isEffectivelyRevealed(),
    results: poll.options.map((o) => ({ optionId: o._id, text: o.text, isCorrect: poll.isEffectivelyRevealed() ? o.isCorrect : undefined, count: countMap[String(o._id)] || 0 })),
  });
});

module.exports = router;
