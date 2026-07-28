const previewOrigin = process.env.PREVIEW_SMOKE_ORIGIN || 'https://preview.zakamurai.com';
const ideOrigins = (process.env.PREVIEW_SMOKE_IDE_ORIGINS || 'https://www.zakamurai.com,https://zakamurai.com')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const previewUrl = `${previewOrigin.replace(/\/$/, '')}/?session=smoke`;

const response = await fetch(previewUrl, { method: 'GET', redirect: 'follow' });
if (!response.ok) {
  throw new Error(`Preview surface ${previewUrl} returned ${response.status}`);
}

const csp = response.headers.get('content-security-policy') || '';
if (!csp.includes('frame-ancestors')) {
  throw new Error(`Preview surface ${previewUrl} is missing frame-ancestors CSP`);
}

for (const ideOrigin of ideOrigins) {
  const host = new URL(ideOrigin).host;
  if (!csp.includes(host)) {
    throw new Error(`Preview surface frame-ancestors is missing IDE host ${host}`);
  }
}

const corp = response.headers.get('cross-origin-resource-policy');
if (corp !== 'cross-origin') {
  throw new Error(`Preview surface ${previewUrl} must send Cross-Origin-Resource-Policy: cross-origin`);
}

console.log(`Preview surface check passed for ${previewUrl}`);
