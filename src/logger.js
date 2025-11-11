const fetch = require('node-fetch');
const { logging: config } = require('./config');

function sanitize(obj) {
  if (!obj) return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  const scrub = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const key of Object.keys(o)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower.includes('authorization') ||
        lower.includes('api_key') ||
        lower.includes('apikey') ||
        lower === 'jwt'
      ) {
        o[key] = '******';
      } else if (o[key] && typeof o[key] === 'object') {
        scrub(o[key]);
      }
    }
  };

  scrub(clone);
  return clone;
}

function buildLokiBody(level, type, details) {
  const ts = `${Date.now()}000000`; 


  const stream = {
    source: config.source,
    level,
    type,
  };

  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    type,
    ...details,
  });

  return {
    streams: [
      {
        stream,
        values: [[ts, line]],
      },
    ],
  };
}

async function send(level, type, details = {}) {
  if (!config || !config.url || !config.userId || !config.apiKey) {
    return;
  }

  try {
    const body = buildLokiBody(level, type, sanitize(details));

    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.userId}:${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.log('Failed to send log to Grafana', text);
    }
  } catch (err) {
    console.log('Error sending log to Grafana', err.message);
  }
}

function httpLogger(req, res, next) {
  const start = Date.now();
  const originalSend = res.send;
  let responseBody;

  res.send = function (body) {
    responseBody = body;
    return originalSend.call(this, body);
  };

  res.on('finish', () => {
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip;

    send('info', 'http', {
      auth: !!req.headers.authorization,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      req: sanitize(req.body),
      res: sanitize(responseBody),
      durationMs: Date.now() - start,
      ip,
    });
  });

  next();
}

function logDb(query, params) {
  send('info', 'db', {
    query,
    params,
  });
}


function logFactory(event) {
  if (!event) return;

  const { type, url, body, status, ok, latencyMs } = event;

  if (type === 'factory_request') {
    send('info', 'factory_request', {
      url,
      req: body,
    });
  } else if (type === 'factory_response') {
    send('info', 'factory_response', {
      url,
      status,
      ok,
      res: body,
      latencyMs,
    });
  } else {
    send('info', 'factory', event);
  }
}

function logError(err, context = {}) {
  if (!err) return;

  send('error', 'error', {
    errorName: err.name,
    errorMessage: err.message,
    stack: err.stack,
    ...context,
  });
}

module.exports = {
  httpLogger,
  logDb,
  logFactory,
  logError,
};
