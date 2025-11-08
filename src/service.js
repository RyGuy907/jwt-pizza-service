const express = require('express');
const { authRouter, setAuthUser } = require('./routes/authRouter.js');
const orderRouter = require('./routes/orderRouter.js');
const franchiseRouter = require('./routes/franchiseRouter.js');
const userRouter = require('./routes/userRouter.js');
const version = require('./version.json');
const config = require('./config.js');
const metrics = require('./metrics'); // ⬅️ add this

const app = express();

app.use(express.json());

// Attach user info from JWT first so metrics can see req.user
app.use(setAuthUser);

// Global CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});

// Metrics middleware: track every request + latency + methods
app.use(metrics.requestTracker); // ⬅️ required for HTTP + latency metrics

// API routes
const apiRouter = express.Router();
app.use('/api', apiRouter);

apiRouter.use('/auth', authRouter);
apiRouter.use('/user', userRouter);
apiRouter.use('/order', orderRouter);
apiRouter.use('/franchise', franchiseRouter);

apiRouter.use('/docs', (req, res) => {
  res.json({
    version: version.version,
    endpoints: [
      ...authRouter.docs,
      ...userRouter.docs,
      ...orderRouter.docs,
      ...franchiseRouter.docs,
    ],
    config: {
      factory: config.factory.url,
      db: config.db.connection.host,
    },
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'welcome to JWT Pizza',
    version: version.version,
  });
});

// 404
app.use('*', (req, res) => {
  res.status(404).json({
    message: 'unknown endpoint',
  });
});

// Error handler
app.use((err, req, res, next) => {
  res.status(err.statusCode ?? 500).json({
    message: err.message,
    stack: err.stack,
  });
  next();
});

module.exports = app;
