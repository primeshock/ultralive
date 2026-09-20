const express = require('express');
const Organization = require('../models/Organization');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/requireRole');
const { hashPassword } = require('../utils/password');
const { generateStreamKey } = require('../utils/streamKey');
const { signOrganizationContext, setOrganizationContext, CONTEXT_COOKIE } = require('../utils/organizationScope');

const router = express.Router();
const USERNAME_RE = /^[a-z0-9_]{3,24}$/i;
router.use(requireAuth, requireRole('owner', 'SUPER_OWNER'));

router.get('/', async (_req, res) => {
  const organizations = await Organization.find().sort({ createdAt: -1 }).populate('ownerId', 'username displayName status');
  res.json(organizations);
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const slug = String(req.body?.slug || '').trim().toLowerCase();
  const username = String(req.body?.ownerUsername || '').trim().toLowerCase();
  const password = req.body?.ownerPassword;
  if (!name || !/^[a-z0-9][a-z0-9-]{2,48}$/.test(slug) || !USERNAME_RE.test(username) || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Organization name, slug, owner username and password are required.' });
  }
  if (await Organization.findOne({ slug })) return res.status(409).json({ error: 'Organization slug already exists.' });
  if (await User.findOne({ username })) return res.status(409).json({ error: 'Owner username already exists.' });
  const organization = await Organization.create({ name, slug });
  const owner = await User.create({ username, passwordHash: await hashPassword(password), streamKey: generateStreamKey(), displayName: username, role: 'ORGANIZATION_OWNER', organizationId: organization._id });
  organization.ownerId = owner._id;
  await organization.save();
  res.status(201).json(await Organization.findById(organization._id).populate('ownerId', 'username displayName status'));
});

router.patch('/:id', async (req, res) => {
  const organization = await Organization.findById(req.params.id);
  if (!organization) return res.status(404).json({ error: 'Organization not found.' });
  if (req.body?.name !== undefined) organization.name = String(req.body.name).trim();
  if (req.body?.status !== undefined && ['ACTIVE', 'DISABLED'].includes(req.body.status)) organization.status = req.body.status;
  await organization.save();
  res.json(organization);
});

router.delete('/:id', async (req, res) => {
  const organization = await Organization.findById(req.params.id);
  if (!organization) return res.status(404).json({ error: 'Organization not found.' });
  await User.deleteOne({ _id: organization.ownerId, organizationId: organization._id });
  await Organization.deleteOne({ _id: organization._id });
  res.json({ ok: true });
});

router.patch('/:id/owner', async (req, res) => {
  const organization = await Organization.findById(req.params.id);
  const owner = organization && await User.findOne({ _id: organization.ownerId, organizationId: organization._id });
  if (!owner) return res.status(404).json({ error: 'Organization owner not found.' });
  if (req.body?.username !== undefined) {
    const username = String(req.body.username).trim().toLowerCase();
    if (!USERNAME_RE.test(username) || await User.findOne({ username, _id: { $ne: owner._id } })) return res.status(409).json({ error: 'Owner username is unavailable.' });
    owner.username = username;
  }
  if (req.body?.password !== undefined) {
    if (typeof req.body.password !== 'string' || req.body.password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    owner.passwordHash = await hashPassword(req.body.password);
  }
  if (req.body?.status !== undefined && ['ACTIVE', 'DISABLED'].includes(req.body.status)) owner.status = req.body.status;
  await owner.save();
  res.json({ id: owner._id, username: owner.username, status: owner.status });
});

router.post('/:id/context', async (req, res) => {
  const organization = await Organization.findOne({ _id: req.params.id, status: 'ACTIVE' });
  if (!organization) return res.status(404).json({ error: 'Active organization not found.' });
  setOrganizationContext(res, signOrganizationContext(req.user._id, organization._id));
  res.json({ organization });
});

router.delete('/context', async (_req, res) => {
  res.clearCookie(CONTEXT_COOKIE);
  res.json({ ok: true });
});

module.exports = router;