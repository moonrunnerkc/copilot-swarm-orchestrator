#!/usr/bin/env node

const { startServer } = require('./dist/src/api/server');

const server = startServer();

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});
