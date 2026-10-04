// Minimaler Ersatz für den Worker (Port 8787) in der Preview-Suite: antwortet wie ein Worker ohne Access-Konfiguration.
// Anfragen, die den Service Worker passieren, werden von page.route nicht abgefangen und landen hier.
import { createServer } from 'node:http';

createServer((_req, res) => {
  res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end('{"error":{"code":"auth_not_configured","message":"stub"}}');
}).listen(8787, '127.0.0.1');
