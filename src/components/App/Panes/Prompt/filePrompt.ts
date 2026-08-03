export type FilePromptCommand = {
  prompt: string;
};

export function parseFileCommand(value: string): FilePromptCommand | null {
  const match = value.match(/^\/file(?:\s+|$)/i);
  if (!match) return null;

  return { prompt: value.slice(match[0].length).trimStart() };
}
