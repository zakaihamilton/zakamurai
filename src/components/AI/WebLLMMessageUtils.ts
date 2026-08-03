const estimateMessageTokens = (message: { content?: string }): number =>
  Math.ceil((message.content?.length || 0) / 3) + 4;

const truncatePreservingEdges = (content: string, maxChars: number): string => {
  if (content.length <= maxChars) return content;
  const marker = '\n…[context truncated]…\n';
  const remaining = maxChars - marker.length;
  const head = Math.ceil(remaining * 0.6);
  return `${content.slice(0, head)}${marker}${content.slice(-(remaining - head))}`;
};

export function pruneWebLLMMessages<T extends { role: string; content?: string }>(
  messages: T[],
  maxTokens = 2800,
): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const result = messages.map((message) => ({ ...message })) as T[];
  const tokenCount = () => result.reduce((sum, message) => sum + estimateMessageTokens(message), 0);

  while (tokenCount() > maxTokens && result.length > 4) {
    result.splice(2, 2);
  }

  const reducibleIndexes = [
    ...(result.length > 1 ? [1] : []),
    ...Array.from({ length: Math.max(0, result.length - 3) }, (_, index) => index + 2),
    ...(result.length > 2 ? [result.length - 1] : []),
    0,
  ];
  for (const index of reducibleIndexes) {
    const current = result[index];
    if (!current?.content || tokenCount() <= maxTokens) break;
    const minimumChars = index === 0 ? 240 : 120;
    const excessChars = Math.max(0, (tokenCount() - maxTokens) * 3);
    const targetChars = Math.max(minimumChars, current.content.length - excessChars);
    result[index] = {
      ...current,
      content: truncatePreservingEdges(current.content, targetChars),
    };
  }

  return result;
}
