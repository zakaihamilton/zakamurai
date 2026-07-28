const PREVIEW_TYPES = new Set([
  'runtime-error',
  'unhandled-rejection',
  'navigate',
  'evidence',
  'reconnect',
]);

export function isPreviewMessageShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    message.source === 'zakamurai-preview' &&
    typeof message.type === 'string' &&
    PREVIEW_TYPES.has(message.type)
  );
}
