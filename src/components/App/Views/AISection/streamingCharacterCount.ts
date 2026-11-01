import type { Root } from 'mdast';
import type { Plugin } from 'unified';

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: {
    hProperties?: Record<string, string>;
    [key: string]: unknown;
  };
};

const markStreamingCounts = (parent: MarkdownNode): void => {
  if (!parent.children) return;

  const children: MarkdownNode[] = [];
  for (const child of parent.children) {
    if (child.type !== 'text' || typeof child.value !== 'string') {
      markStreamingCounts(child);
      children.push(child);
      continue;
    }

    const streamingCountPattern = /streaming its next action \(([\d,]+)(?= character\(s\) received)/g;
    let cursor = 0;
    let match = streamingCountPattern.exec(child.value);
    if (!match) {
      children.push(child);
      continue;
    }

    while (match) {
      const count = match[1];
      const countStart = match.index + match[0].lastIndexOf(count);
      if (countStart > cursor) {
        children.push({ type: 'text', value: child.value.slice(cursor, countStart) });
      }
      children.push({
        type: 'inlineCode',
        value: count,
        data: { hProperties: { className: 'streaming-character-count' } },
      });
      cursor = countStart + count.length;
      match = streamingCountPattern.exec(child.value);
    }

    if (cursor < child.value.length) {
      children.push({ type: 'text', value: child.value.slice(cursor) });
    }
  }

  parent.children = children;
};

export const remarkStreamingCharacterCount: Plugin<[], Root> = () => (tree) => {
  markStreamingCounts(tree as unknown as MarkdownNode);
};
