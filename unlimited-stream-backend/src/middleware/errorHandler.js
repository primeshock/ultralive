function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  const isMulterError = err.name === 'MulterError';
  const status = err.status || (isMulterError ? 400 : 500);
  const message = isMulterError && err.code === 'LIMIT_FILE_SIZE' ? 'حجم فایل بیشتر از حد مجازه' : err.message;
  res.status(status).json({ error: message || 'Internal server error' });
}

module.exports = { notFound, errorHandler };
