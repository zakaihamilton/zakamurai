export type ConsoleLogLevel = 'log' | 'warn' | 'error';

export type ConsoleLogEntry = {
  timestamp?: number;
  level: ConsoleLogLevel;
  message: string;
  source?: string;
  line?: number;
  stack?: string;
};

export type InspectConsoleLogsQuery = {
  level?: ConsoleLogLevel;
  query?: string;
  limit?: number;
};

export function filterConsoleLogs(
  logs: ConsoleLogEntry[],
  options?: InspectConsoleLogsQuery,
): ConsoleLogEntry[] {
  const level = options?.level;
  const query = options?.query?.toLowerCase().trim();
  const limit = options?.limit ?? 50;

  let filtered = logs;

  if (level) {
    filtered = filtered.filter((log) => log.level === level);
  }

  if (query) {
    filtered = filtered.filter(
      (log) =>
        log.message.toLowerCase().includes(query) ||
        Boolean(log.source?.toLowerCase().includes(query)) ||
        Boolean(log.stack?.toLowerCase().includes(query)),
    );
  }

  return filtered.slice(-limit);
}

export function formatConsoleLogs(logs: ConsoleLogEntry[]): string {
  if (logs.length === 0) {
    return 'No matching console logs recorded.';
  }

  return logs
    .map((log) => {
      const timeStr = log.timestamp ? `[${new Date(log.timestamp).toISOString()}] ` : '';
      const sourceStr = log.source ? ` (${log.source}${log.line ? `:${log.line}` : ''})` : '';
      const stackStr = log.stack ? `\n  Stack trace:\n  ${log.stack.split('\n').join('\n  ')}` : '';
      return `${timeStr}[${log.level.toUpperCase()}] ${log.message}${sourceStr}${stackStr}`;
    })
    .join('\n');
}
