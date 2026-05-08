const { validateEnvironment } = require('../config/env');
validateEnvironment();
const app = require('../app');

module.exports = app;
