const http = require('http');

const port = process.env.PORT || 3000;
const url = process.env.SMOKE_URL || `http://127.0.0.1:${port}/health`;

http.get(url, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    if (res.statusCode !== 200 || !body.includes('"ok":true')) {
      console.error(`Smoke failed: ${res.statusCode} ${body}`);
      process.exit(1);
    }
    console.log(`Smoke OK: ${url}`);
  });
}).on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
