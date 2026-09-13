const express = require('express');
const { Poll, PollResponse } = require('../models/Poll');
const { checkStudentAccess } = require('../utils/checkStudentAccess');
const { COOKIE_NAME, verifyToken } = require('../utils/jwt');

const router = express.Router();

async function identify(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) {
    try {
      const { sub } = verifyToken(token);
      return `staff:${sub}`; // real accounts can also vote, tracked separately from students
    } catch {
      /* fall through */
    }
  }
  const access = await checkStudentAccess(req.params.channel.toLowerCase(), req.cookies || {});
  return access.externalUserId;
}

router.get('/:channel/polls/active', async (req, res) => {
  try {
    await identify(req);
  } catch {
    return res.status(401).json({ error: 'دسترسی ندارید.' });
  }
  const poll = await Poll.findOne({ channel: req.params.channel.toLowerCase() }).sort({ createdAt: -1 });
  if (!poll) return res.json(null);
  res.json({
    id: poll._id,
    question: poll.question,
    mode: poll.mode,
    options: poll.options.map((o) => ({ id: o._id, text: o.text })),
    isOpen: poll.isEffectivelyOpen(),
  });
});

router.post('/:channel/polls/:pollId/vote', async (req, res) => {
  let userId;
  try {
    userId = await identify(req);
  } catch {
    return res.status(401).json({ error: 'دسترسی ندارید.' });
  }
  const poll = await Poll.findById(req.params.pollId);
  if (!poll || !poll.isEffectivelyOpen()) return res.status(400).json({ error: 'این نظرسنجی بسته شده است.' });
  if (!poll.options.some((o) => String(o._id) === req.body?.optionId)) {
    return res.status(400).json({ error: 'گزینه نامعتبر.' });
  }
  await PollResponse.findOneAndUpdate({ pollId: poll._id, userId }, { optionId: req.body.optionId }, { upsert: true });
  res.status(204).end();
});

module.exports = router;
