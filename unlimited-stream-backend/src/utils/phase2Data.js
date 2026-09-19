const Class = require('../models/Class');
const LiveSession = require('../models/LiveSession');
const Attendance = require('../models/Attendance');
const AdminNote = require('../models/AdminNote');

async function deleteClassArchitecture(channel) {
  const classDoc = await Class.findOne({ channel: String(channel || '').toLowerCase() }).select('_id');
  if (!classDoc) return;
  const sessions = await LiveSession.find({ classId: classDoc._id }).select('_id');
  const sessionIds = sessions.map((session) => session._id);
  await Promise.all([
    sessionIds.length ? Attendance.deleteMany({ sessionId: { $in: sessionIds } }) : null,
    LiveSession.deleteMany({ classId: classDoc._id }),
    AdminNote.deleteMany({ classId: classDoc._id }),
    Class.deleteOne({ _id: classDoc._id }),
  ]);
}

module.exports = { deleteClassArchitecture };