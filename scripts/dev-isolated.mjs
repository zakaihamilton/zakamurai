import { spawn } from 'node:child_process';
import http from 'node:http';

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const ide = spawn(command, ['run', 'dev', '--', '--port', '3000'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_IDE_ORIGIN: 'http://localhost:3000',
    NEXT_PUBLIC_PREVIEW_ORIGIN: 'http://localhost:3001',
  },
});

const previewProxy = http.createServer((request, response) => {
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: 3000,
      path: request.url,
      method: request.method,
      // Keep Host as localhost:3001 so Next.js client hydration matches the
      // browser origin. Surface detection uses x-zakamurai-surface instead.
      headers: { ...request.headers, host: 'localhost:3001', 'x-zakamurai-surface': 'preview' },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, {
        ...upstreamResponse.headers,
        'cross-origin-resource-policy': 'cross-origin',
      });
      upstreamResponse.pipe(response);
    },
  );
  upstream.on('error', () => {
    response.writeHead(502, { 'Content-Type': 'text/plain' });
    response.end('Preview runtime is waiting for the IDE dev server.');
  });
  request.pipe(upstream);
});
previewProxy.on('upgrade', (request, socket, head) => {
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: request.url,
    method: request.method,
    headers: { ...request.headers, host: 'localhost:3001', 'x-zakamurai-surface': 'preview' },
  });
  upstream.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(upstreamResponse.headers)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
        .join('\r\n')}\r\n\r\n`,
    );
    if (upstreamHead.length) socket.write(upstreamHead);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });
  upstream.on('error', () => socket.destroy());
  upstream.end(head);
});
previewProxy.listen(3001, '127.0.0.1', () => {
  console.log('Isolated preview proxy ready at http://localhost:3001');
});

const stop = () => {
  previewProxy.close();
  ide.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
ide.on('exit', (code) => {
  previewProxy.close();
  if (code && code !== 0) process.exitCode = code;
});
