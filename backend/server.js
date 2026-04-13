const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

function getTimestamp() {
  const now = new Date();
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false
  };
  return now.toLocaleString('en-US', options).replace(' at', '');
}

function logInfo(message) {
  console.log(`[${getTimestamp()}] [INFO]: ${message}`);
}

function logError(message) {
  console.error(`[${getTimestamp()}] [ERROR]: ${message}`);
}

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const postsRoutes = require('./routes/posts');
app.use('/api/posts', postsRoutes);

const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath));
logInfo(`Serving static files from: ${staticPath}`);

app.get('/', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(staticPath, 'index.html'));
});

app.use((err, req, res, next) => {
  logError(err.stack || err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  logInfo(`Server successfully started on port ${port}`);
  logInfo(`Access the application at: http://localhost:${port}`);
});