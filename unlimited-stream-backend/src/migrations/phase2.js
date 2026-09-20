const User = require('../models/User');
const Class = require('../models/Class');
const Student = require('../models/Student');

async function backfillOrganizationIds() {
  const models = [User, Student, Class];
  const results = await Promise.all(
    models.map((Model) => Model.updateMany({ organizationId: { $exists: false } }, { $set: { organizationId: null } }))
  );
  return results.reduce((total, result) => total + result.modifiedCount, 0);
}

async function migrateLegacyOwnerRoles() {
  const result = await User.updateMany({ role: 'owner' }, { $set: { role: 'SUPER_OWNER' } });
  return result.modifiedCount;
}

async function syncLegacyClasses() {
  const teachers = await User.find({ role: 'teacher' }).select('_id username displayName streamTitle streamKey accessMode managedBy organizationId');
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
          organizationId: teacher.organizationId || null,
        },
        $setOnInsert: { description: '', settings: {} },
      },
      upsert: true,
    },
  }));
  await Class.bulkWrite(operations, { ordered: false });
  return teachers.length;
}

module.exports = { backfillOrganizationIds, migrateLegacyOwnerRoles, syncLegacyClasses };