const fetch = require('node-fetch');
const http = require('http');
const app = require('./server'); // Wait, server.js doesn't export app.

// Let's just make a POST request to localhost:3000/api/casos/pdf with a dummy payload
// But we need a token. We don't have one.
