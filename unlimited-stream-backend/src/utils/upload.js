const multer = require('multer');

const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    // This only checks the client-claimed Content-Type of the multipart part —
    // trivially spoofable. It's a cheap first reject; the real check is the
    // magic-byte verification in isJpeg() against the actual uploaded bytes.
    if (file.mimetype !== 'image/jpeg') {
      const err = new Error('فقط فایل jpg مجازه');
      err.status = 400;
      cb(err);
      return;
    }
    cb(null, true);
  },
});

// JPEG files always start with the SOI marker 0xFFD8FF. Checking this on the actual
// uploaded bytes (not the client-supplied mimetype/filename, which can claim anything)
// is what stops someone uploading an SVG/HTML/script file relabeled as image/jpeg —
// e.g. to get stored XSS if the file were ever served back with a sniffable type.
function isJpeg(buffer) {
  return (
    buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  );
}

module.exports = { thumbnailUpload, isJpeg };
