const User = require('../models/User');
const Class = require('../models/Class');

async function syncLegacyClasses() {
  const teachers = await User.find({ role: 'teacher' }).select('_id username displayName streamTitle streamKey accessMode managedBy');
  if (!teachers.length) return 0;

  const operations = teachers.map((teacher) => ({
    updateOne: {
      filter: { channel: teacher.username },
      update: {
        $set: {
          title: teacher.streamTitle || teacher.displayName || teacher.username,
          slug: teacher.username,
          channel: teacher.username,
          streamKey: teacher.streamKey || '',
          visibility: teacher.accessMode === 'public' ? 'public' : 'private',
          ownerId: teacher.managedBy || teacher._id,
        },
        $setOnInsert: { description: '', settings: {} },
      },
      upsert: true,
    },
  }));
  await Class.bulkWrite(operations, { ordered: false });
  return teachers.length;
}

module.exports = { syncLegacyClasses };