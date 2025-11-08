const os = require("os");
const config = require("./config");

const METRICS_SOURCE = config.metrics.source;
const METRICS_URL = config.metrics.url;
const METRICS_API_KEY = config.metrics.apiKey;

let lastCpuUsage = process.cpuUsage();
let lastHrtime = process.hrtime();

let totalRequests = 0;
const requestsByMethod = {
  GET: 0,
  POST: 0,
  PUT: 0,
  DELETE: 0,
};

const endpointLatencySum = {};
const endpointLatencyCount = {};

let activeUsers = 0;
let authSuccess = 0;
let authFailure = 0;
let pizzasSold = 0;
let pizzaFailures = 0;
let pizzaRevenue = 0;
let pizzaLatencySum = 0;
let pizzaLatencyCount = 0;


function buildAuthHeader() {
  const encoded = Buffer.from(METRICS_API_KEY).toString("base64");
  return `Basic ${encoded}`;
}

function createMetric(
  name,
  value,
  unit,
  metricType,
  valueField,
  attributes = {}
) {
  attributes = { ...attributes, source: METRICS_SOURCE };

  const dataPoint = {
    [valueField]: value,
    timeUnixNano: Date.now() * 1e6,
    attributes: Object.entries(attributes).map(([key, val]) => ({
      key,
      value: { stringValue: String(val) },
    })),
  };

  const metric = {
    name,
    unit,
    [metricType]: {
      dataPoints: [dataPoint],
    },
  };

  if (metricType === "sum") {
    metric[metricType].aggregationTemporality =
      "AGGREGATION_TEMPORALITY_CUMULATIVE";
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function getCpuUsagePercentage() {
    if (process.platform === "win32") {
      const currentUsage = process.cpuUsage();
      const currentHrtime = process.hrtime();

      const userDiff = currentUsage.user - lastCpuUsage.user;
      const systemDiff = currentUsage.system - lastCpuUsage.system;
      const totalDiffMicros = userDiff + systemDiff;

      const hrDiffMicros =
        (currentHrtime[0] - lastHrtime[0]) * 1e6 +
        (currentHrtime[1] - lastHrtime[1]) / 1e3;
      lastCpuUsage = currentUsage;
      lastHrtime = currentHrtime;

      if (hrDiffMicros <= 0) {
        return 0;
      }

      const cores = os.cpus().length || 1;
      const percent = Math.min(100, (totalDiffMicros / hrDiffMicros / cores) * 100);
      return Number(percent.toFixed(2));
    }
    const loads = os.loadavg();
    const load1 = loads[0] || 0;
    const cores = os.cpus().length || 1;
    const pct = Math.max(0, Math.min(100, (load1 / cores) * 100));
    return Number(pct.toFixed(2));
  }

function getMemoryUsagePercentage() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return Number(((used / total) * 100).toFixed(2));
}

async function sendMetricBatch(metrics) {
  if (!metrics.length) return;

  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(METRICS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: buildAuthHeader(),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Error sending metrics:", res.status, text);
    }
  } catch (err) {
    console.error("Error sending metrics:", err.message || err);
  }
}

function requestTracker(req, res, next) {
  const method = (req.method || "").toUpperCase();
  const path = req.path || req.originalUrl || "/";
  const endpoint = `[${method}] ${path}`;

  const start = Date.now();

  totalRequests++;
  if (requestsByMethod[method] !== undefined) {
    requestsByMethod[method]++;
  }

  res.on("finish", () => {
    const latency = Date.now() - start;

    endpointLatencySum[endpoint] =
      (endpointLatencySum[endpoint] || 0) + latency;
    endpointLatencyCount[endpoint] =
      (endpointLatencyCount[endpoint] || 0) + 1;
  });

  next();
}

function trackAuth(success) {
  if (success) authSuccess++;
  else authFailure++;
}

function addUser() {
  activeUsers++;
}

function decrementUser() {
  if (activeUsers > 0) activeUsers--;
}

function pizzaPurchase(success, latencyMs, price) {
  if (success) {
    pizzasSold++;
    pizzaRevenue += Number(price || 0);
  } else {
    pizzaFailures++;
  }

  if (typeof latencyMs === "number") {
    pizzaLatencySum += latencyMs;
    pizzaLatencyCount++;
  }
}

function flushMetrics() {
  const metrics = [];

  metrics.push(
    createMetric(
      "http_requests_total",
      totalRequests,
      "1",
      "sum",
      "asInt"
    )
  );

  Object.entries(requestsByMethod).forEach(([method, count]) => {
    metrics.push(
      createMetric(
        "http_requests_by_method_total",
        count,
        "1",
        "sum",
        "asInt",
        { method }
      )
    );
  });

  metrics.push(
    createMetric(
      "active_users",
      activeUsers,
      "1",
      "gauge",
      "asInt"
    )
  );

  metrics.push(
    createMetric(
      "auth_attempts_success_total",
      authSuccess,
      "1",
      "sum",
      "asInt"
    )
  );
  metrics.push(
    createMetric(
      "auth_attempts_failure_total",
      authFailure,
      "1",
      "sum",
      "asInt"
    )
  );

  metrics.push(
    createMetric(
      "cpu_usage_percent",
      getCpuUsagePercentage(),
      "%",
      "gauge",
      "asDouble"
    )
  );
  metrics.push(
    createMetric(
      "memory_usage_percent",
      getMemoryUsagePercentage(),
      "%",
      "gauge",
      "asDouble"
    )
  );

  metrics.push(
    createMetric(
      "pizza_sold_total",
      pizzasSold,
      "1",
      "sum",
      "asInt"
    )
  );
  metrics.push(
    createMetric(
      "pizza_creation_failures_total",
      pizzaFailures,
      "1",
      "sum",
      "asInt"
    )
  );
  metrics.push(
    createMetric(
      "pizza_revenue_total",
      pizzaRevenue,
      "USD",
      "sum",
      "asDouble"
    )
  );

  Object.entries(endpointLatencySum).forEach(([endpoint, sum]) => {
    const count = endpointLatencyCount[endpoint] || 1;
    const avg = sum / count;

    metrics.push(
      createMetric(
        "endpoint_latency_ms",
        avg,
        "ms",
        "gauge",
        "asDouble",
        { endpoint }
      )
    );
  });

  if (pizzaLatencyCount > 0) {
    const avgPizzaLatency = pizzaLatencySum / pizzaLatencyCount;
    metrics.push(
      createMetric(
        "pizza_creation_latency_ms",
        avgPizzaLatency,
        "ms",
        "gauge",
        "asDouble"
      )
    );
  }

  return sendMetricBatch(metrics);
}

function startMetrics(intervalMs = 10000) {
  setInterval(flushMetrics, intervalMs);
}

startMetrics();
module.exports = {
  requestTracker,
  trackAuth,
  pizzaPurchase,
  addUser,
  decrementUser,
};
