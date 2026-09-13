const express = require('express');
const { listLive, getChannel } = require('../controllers/stream.controller');

const router = express.Router();

router.get('/live', listLive);
router.get('/:username', getChannel);

module.exports = router;
