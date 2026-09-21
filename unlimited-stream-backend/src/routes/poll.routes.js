const express = require('express');
const { Poll, PollResponse } = require('../models/Poll');
const { findScopedStreamTarget, canManageStreamTarget } = require('../utils/streamTarget');

const router = express.Router();
// Mounted after requireAuth+requireRole('admin','owner') in admin.routes.js (see wiring note).

async function canManagePoll(req, poll) {
  if (!poll) return false;
  const target = await findScopedStreamTarget(req, poll.channel);
  return canManageStreamTarget(req, target);
}

async function canManageChannel(req, channel) {
  const target = await findScopedStreamTarget(req, channel);
  return canManageStreamTarget(req, target);
}

async function loadManagedPoll(req, res) {
  const poll = await Poll.findById(req.params.pollId);
  if (!poll) {
    res.status(404).json({ error: 'نظرسنجی پیدا نشد.' });
    return null;
  }
  if (!(await canManagePoll(req, poll))) {
    res.status(403).json({ error: 'به این نظرسنجی دسترسی ندارید.' });
    return null;
  }
  return poll;
}

router.get('/channels/:channel/polls', async (req, res) => {
  if (!(await canManageChannel(req, req.params.channel))) return res.status(404).json({ error: 'کانال پیدا نشد.' });
  const polls = await Poll.find({ channel: req.params.channel.toLowerCase() }).sort({ createdAt: -1 }).limit(50);
  res.json(polls);
});

router.post('/channels/:channel/polls', async (req, res) => {
  if (!(await canManageChannel(req, req.params.channel))) return res.status(404).json({ error: 'کانال پیدا نشد.' });
  const { question, mode, options, timerSeconds, revealAt, showResults } = req.body || {};
  const normalizedQuestion = String(question || '').trim();
  const normalizedOptions = Array.isArray(options)
    ? options.map((option) => ({ ...option, text: String(option?.text || '').trim() })).filter((option) => option.text)
    : [];
  const hasTimer = timerSeconds !== undefined && timerSeconds !== null && String(timerSeconds).trim() !== '';
  const timer = Number(timerSeconds);
  if (!normalizedQuestion || normalizedQuestion.length > 500 || normalizedOptions.length < 2) {
    return res.status(400).json({ error: 'سوال و حداقل دو گزینه لازم است.' });
  }
  if (hasTimer && (!Number.isFinite(timer) || timer <= 0)) return res.status(400).json({ error: 'مدت تایمر باید بیشتر از صفر باشد.' });
  const poll = await Poll.create({
    channel: req.params.channel.toLowerCase(),
    question: normalizedQuestion,
    mode: mode === 'quiz' ? 'quiz' : 'poll',
    options: normalizedOptions,
    closesAt: hasTimer ? new Date(Date.now() + timer * 1000) : null,
    revealAt: revealAt ? new Date(revealAt) : null,
    showResults: Boolean(showResults),
    createdBy: String(req.user._id),
  });
  res.status(201).json(poll);
});

router.patch('/polls/:pollId', async (req, res) => {
  if (!(await loadManagedPoll(req, res))) return;
  const update = {};
  if (typeof req.body?.showResults === 'boolean') update.showResults = req.body.showResults;
  if (typeof req.body?.question === 'string' && req.body.question.trim()) update.question = req.body.question.trim();
  const poll = await Poll.findByIdAndUpdate(req.params.pollId, update, { new: true });
  if (!poll) return res.status(404).json({ error: 'نظرسنجی پیدا نشد.' });
  res.json(poll);
});

router.post('/polls/:pollId/options', async (req, res) => {
  if (!(await loadManagedPoll(req, res))) return;
  const { text, isCorrect } = req.body || {};
  const poll = await Poll.findByIdAndUpdate(
    req.params.pollId,
    { $push: { options: { text, isCorrect: Boolean(isCorrect) } } },
    { new: true }
  );
  res.json(poll);
});

router.delete('/polls/:pollId/options/:optionId', async (req, res) => {
  const poll = await loadManagedPoll(req, res);
  if (!poll) return;
  if (poll.options.length <= 2) return res.status(400).json({ error: 'حداقل دو گزینه لازم است.' });
  poll.options = poll.options.filter((option) => String(option._id) !== req.params.optionId);
  await poll.save();
  await PollResponse.deleteMany({ pollId: poll._id, optionId: req.params.optionId });
  res.json(poll);
});

router.patch('/polls/:pollId/options/:optionId', async (req, res) => {
  const poll = await loadManagedPoll(req, res);
  if (!poll) return;
  const option = poll.options.id(req.params.optionId);
  if (!option) return res.status(404).json({ error: 'گزینه پیدا نشد.' });
  if (typeof req.body?.isCorrect !== 'boolean') return res.status(400).json({ error: 'مقدار صحیح/غلط نامعتبر است.' });
  if (poll.mode === 'poll' && req.body.isCorrect) return res.status(400).json({ error: 'نظرسنجی گزینه صحیح ندارد.' });
  if (req.body.isCorrect) poll.options.forEach((item) => { item.isCorrect = false; });
  option.isCorrect = req.body.isCorrect;
  await poll.save();
  res.json(poll);
});

router.post('/polls/:pollId/close', async (req, res) => {
  const poll = await loadManagedPoll(req, res);
  if (!poll) return;
  poll.isOpen = false;
  await poll.save();
  res.json(poll);
});

router.post('/polls/:pollId/reveal', async (req, res) => {
  const poll = await loadManagedPoll(req, res);
  if (!poll) return;
  poll.revealed = true;
  await poll.save();
  res.json(poll);
});

// "ریست گزینه‌ها": clears all votes, keeps the poll open for a re-vote.
router.post('/polls/:pollId/reset', async (req, res) => {
  const poll = await loadManagedPoll(req, res);
  if (!poll) return;
  await PollResponse.deleteMany({ pollId: poll._id });
  poll.isOpen = true;
  poll.revealed = false;
  if (poll.closesAt && poll.closesAt <= new Date()) {
    const durationMs = poll.closesAt.getTime() - poll.createdAt.getTime();
    poll.closesAt = durationMs > 0 ? new Date(Date.now() + durationMs) : null;
  }
  await poll.save();
  res.json(poll);
});

router.get('/polls/:pollId/results', async (req, res) => {
  const poll = await loadManagedPoll(req, res);
  if (!poll) return;

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
