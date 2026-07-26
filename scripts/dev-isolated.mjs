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
      headers: { ...request.headers, host: 'localhost:3000', 'x-zakamurai-surface': 'preview' },
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
