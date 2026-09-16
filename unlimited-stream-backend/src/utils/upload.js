const multer = require('multer');

function imageUpload(allowedMimes) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!allowedMimes.includes(file.mimetype)) {
        const err = new Error('فرمت تصویر نامعتبر است.');
        err.status = 400;
        cb(err);
        return;
      }
      cb(null, true);
    },
  });
}

const thumbnailUpload = imageUpload(['image/jpeg']);
const logoUpload = imageUpload(['image/png']);

function isJpeg(buffer) {
  return Boolean(buffer) && buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isPng(buffer) {
  return Boolean(buffer) && buffer.length >= 8
    && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;
}

module.exports = { thumbnailUpload, logoUpload, isJpeg, isPng };
