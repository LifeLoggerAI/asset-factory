function emit(level, message, context = {}) {
  const payload = {
    level,
    message,
    ...context,
    ts: new Date().toISOString(),
  };

  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

const logger = {
  info(message, context) {
    emit('info', message, context);
  },
  warn(message, context) {
    emit('warn', message, context);
  },
  error(message, context) {
    emit('error', message, context);
  },
};

module.exports = { logger };
