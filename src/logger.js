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
    console.log('[LOGGER] Missing logging config, skipping send', {
      hasUrl: !!config?.url,
      hasUserId: !!config?.userId,
      hasApiKey: !!config?.apiKey,
    });
    return;
  }

  try {
    const body = buildLokiBody(level, type, sanitize(details));

    // Basic auth: base64("userId:apiKey")
    const basicToken = Buffer
      .from(`${config.userId}:${config.apiKey}`)
      .toString('base64');

    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.log('[LOGGER] Failed to send log to Grafana', res.status, text);
    } else {
      // You can comment this out later once you know prod works
      // console.log('[LOGGER] Sent log to Grafana', { level, type });
    }
  } catch (err) {
    console.log('[LOGGER] Error sending log to Grafana', err.message);
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
