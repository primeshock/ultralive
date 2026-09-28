const Moderation = require('../models/Moderation');
const Student = require('../models/Student');
const User = require('../models/User');
const { findStreamTarget, streamName, isClassTarget } = require('../utils/streamTarget');

function targetFilter(target) {
  const channels = [...new Set([streamName(target), target.channel].filter(Boolean))];
  const alternatives = [{ channel: { $in: channels } }];
  if (isClassTarget(target)) alternatives.push({ classId: target._id });
  return { $or: alternatives };
}
async function resolveStudent(target, identity) {
  const organizationId = target.organizationId || null;
  let student = await Student.findOne({ organizationId, externalId: String(identity) });
  if (!student) {
    const user = await User.findOne({ organizationId, username: String(identity) }).select('_id');
    if (user) student = await Student.findOne({ organizationId, userId: user._id });
  }
  return student;
}
async function list(target) {
  const rows = await Moderation.find(targetFilter(target)).sort({ createdAt: -1 }).populate('studentId', 'externalId name').lean();
  for (const row of rows) {
    const student = row.studentId || await resolveStudent(target, row.externalUserId);
    row.identities = [row.externalUserId];
    if (student) {
      row.studentId = student; row.externalUserId = student.externalId;
      row.identities.push(student.externalId);
      const fullStudent = student.userId ? student : await Student.findById(student._id).select('userId');
      if (fullStudent?.userId) {
        const user = await User.findById(fullStudent.userId).select('username');
        if (user) row.identities.push(user.username);
      }
    }
  }
  return rows;
}
async function restrict(target, identity, payload, actor) {
  const student = await resolveStudent(target, identity);
  const externalUserId = student?.externalId || String(identity);
  const doc = await Moderation.create({
    channel: streamName(target),
    classId: isClassTarget(target) ? target._id : undefined,
    studentId: student?._id,
    externalUserId, type: payload.type, scope: payload.scope,
    expiresAt: payload.scope === 'timed' ? new Date(Date.now() + Number(payload.minutes) * 60000) : null,
    reason: String(payload.reason || '').trim(), createdBy: String(actor),
  });
  if (payload.type === 'ban') {
    require('./chat').disconnectModeratedUser(streamName(target), externalUserId);
    // Preserve the existing moderation disconnect behavior, without changing LiveKit.
    require('./livekit').disconnectStudent(streamName(target), externalUserId).catch((error) => {
      if (!/not found|does not exist|no room/i.test(String(error.message || error))) console.error('[moderation] disconnect failed', error.message);
    });
  }
  return doc.populate('studentId', 'externalId name');
}
async function remove(target, doc) {
  const student = await resolveStudent(target, doc.externalUserId);
  const identities = [doc.externalUserId, student?.externalId].filter(Boolean);
  if (student?.userId) {
    const user = await User.findById(student.userId).select('username');
    if (user) identities.push(user.username);
  }
  // Remove all duplicate restrictions of this type, so an older row cannot reappear.
  await Moderation.deleteMany({ $and: [targetFilter(target), { type: doc.type }, { $or: [
    { externalUserId: { $in: identities } }, ...(student ? [{ studentId: student._id }] : []),
  ] }] });
}
async function active(channel, identity, type) {
  const target = await findStreamTarget(channel);
  if (!target) return null;
  const student = await resolveStudent(target, identity);
  const identities = [String(identity), student?.externalId].filter(Boolean);
  if (student?.userId) {
    const user = await User.findById(student.userId).select('username');
    if (user) identities.push(user.username);
  }
  return Moderation.findOne({ $and: [targetFilter(target), { type },
    { $or: [{ externalUserId: { $in: identities } }, ...(student ? [{ studentId: student._id }] : [])] },
    { $or: [{ scope: 'permanent' }, { scope: 'timed', expiresAt: { $gt: new Date() } }] },
  ] });
}
module.exports = { targetFilter, list, restrict, remove, active };
