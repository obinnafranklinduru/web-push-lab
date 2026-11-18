export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  console.error(`[ERROR] ${req.method} ${req.originalUrl} -> ${status}: ${message}`);

  res.status(status).json({
    success: false,
    error: {
      message,
      status,
    },
  });
}
