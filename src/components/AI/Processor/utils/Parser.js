/**
 * Extracts file blocks from the AI response.
 *
 * @param {string} response - The raw string from the AI.
 * @param {string} [activeTabId] - Fallback file path if no markers found.
 * @returns {import('../Main').AIFileBlock[]}
 */
export function parseAIResponse(response, activeTabId) {
  const fileBlocksMap = new Map();
  const fileRegex =
    /\/\/ --- File: (.*?) ---\s*([\s\S]*?)(?=\s*\/\/ --- (?:End )?File(?::.*?)? ---)/g;

  let match = fileRegex.exec(response);
  while (match !== null) {
    const filePath = match[1].trim();
    let content = match[2].trim();

    // Handle internal restarts within a block (e.g. AI self-correction without repeating the header)
    const isStructured =
      filePath.endsWith('.md') ||
      filePath.endsWith('.yaml') ||
      filePath.endsWith('.yml') ||
      filePath.endsWith('.txt');
    if (!isStructured) {
      const internalRestarts = content.includes('<<<<<<< SEARCH')
        ? [content]
        : content.split(/\n\s*(?:={3,}|-{3,})\s*\n/);
      if (internalRestarts.length > 1) {
        const firstPart = internalRestarts[0].trim();
        const lastPart = internalRestarts[internalRestarts.length - 1].trim();

        // Heuristic to decide if it's a restart:
        // 1. The last part contains SEARCH/REPLACE markers
        // 2. The first part is short (apology or partial)
        // 3. The first part contains apology keywords
        // 4. The last part starts with the same code as the first part
        const isCorrection =
          lastPart.includes('<<<<<<< SEARCH') ||
          firstPart.length < 100 ||
          /\b(sorry|mistake|confusion|error|restart|correction)\b/i.test(firstPart) ||
          (firstPart.length > 10 &&
            lastPart
              .replace(/\s+/g, '')
              .startsWith(firstPart.replace(/\s+/g, '').substring(0, 20)));

        if (isCorrection) {
          content = lastPart;
        }
      }
      if (!content.includes('<<<<<<< SEARCH')) {
        const restartKeywords =
          /\s*(?:sorry|apologize|confusion|correct response|user request|here is the correct|corrected implementation)[\s\S]*?(?=\n\s*(?:export|import|const|function|class|public|private|async|await|#|@|\/\/|{|<))/i;
        const restartMatch = content.match(restartKeywords);
        if (restartMatch) {
          // Discard everything before and including the apology/restart keyword
          const splitIdx = restartMatch.index + restartMatch[0].length;
          content = content.substring(splitIdx).trim();
          console.info(`[Processor] Detected and cleaned up internal AI restart for ${filePath}.`);
        }
      }
    }

    // Check for AI refusal mid-block
    const refusalPatterns = [
      "sorry, but i can't assist",
      'sorry, but i cannot assist',
      "i am sorry, but i can't",
      'i am sorry, but i cannot',
      'i apologize, but i cannot',
      "i apologize, but i can't",
    ];

    if (refusalPatterns.some((pattern) => content.toLowerCase().includes(pattern))) {
      console.warn(`[Processor] Block for ${filePath} contains an AI refusal. Skipping.`);
      match = fileRegex.exec(response);
      continue;
    }

    // Check for placeholders/abbreviations that signify incomplete code (e.g. [...])
    const abbreviationPatterns = [
      /\[BRAND NEW code content\]/,
      /\[Existing code\.\.\.\]/,
      /\[Rest of the file\.\.\.\]/,
      /REPLACE_WITH_ACTUAL_CONTENT/i,
      /\/\/\s*rest of (?:code|file)/i,
      /^Vendor [A-Z]:/m,
      /^Context Item #\d+:/m,
    ];

    if (abbreviationPatterns.some((p) => p.test(content))) {
      console.warn(
        `[Processor] Block for ${filePath} contains placeholders or abbreviations. Skipping to prevent file corruption.`,
      );
      match = fileRegex.exec(response);
      continue;
    }

    // Clean up stray characters (like 's' from 'sorry') that might be left by the AI
    const lines = content.split('\n');
    content = lines
      .filter((line) => {
        const trimmed = line.trim();
        // Skip single characters that look like a failed apology start (s, sorry, etc)
        if (trimmed.length === 1 && /^[a-z]$/i.test(trimmed)) return false;
        // Skip hallucinated labels or diff markers (e.g., "- [teacher]")
        if (/^[-+]\s*\[/.test(trimmed)) return false;
        // Skip hallucinated Vendor/Context labels
        if (/^Vendor [A-Z]:/i.test(trimmed)) return false;
        // Skip lines that look like apologies or chatter
        if (/^(?:sorry|apologize|mistake|confusion|error|restart|correction|here is the|correct response|user request)\b/i.test(trimmed)) return false;
        return true;
      })
      .map((line) => {
        // Strip AI annotations and helper comments
        let cleaned = line;

        // 1. Strip HTML comments: <!-- ... -->
        cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

        // 2. Strip JSX helper comments: {/* Additional feature item */}
        cleaned = cleaned.replace(
          /\{\/\*[\s\S]*?(?:added|feature|item|change|new|line)[\s\S]*?\*\/\}/gi,
          '',
        );

        // 3. Strip Block helper comments: /* Added ... */
        cleaned = cleaned.replace(
          /\/\*[\s\S]*?(?:added|feature|item|change|new|line)[\s\S]*?\*\//gi,
          '',
        );

        // Only strip if the comment contains AI-like keywords and NOT "NEW LINE"
        if (/new line/i.test(cleaned)) return cleaned.trimEnd();

        // Strip format labels: // [exact lines to change], // [new lines]
        cleaned = cleaned.replace(/\/\/\s*\[(?:exact lines to change|new lines)\]/gi, '');

        cleaned = cleaned.replace(/\/\/\s*.*(?:added|feature|item|change|new|line).*$/gi, '');

        return cleaned.trimEnd();
      })
      .filter((line) => line.trim() !== '' || line === '')
      .join('\n');

    // Truncation check: If the block hit the end of the response without a terminator
    // and looks incomplete (e.g. ends with a lone character or partial tag), discard it.
    const matchEnd = match.index + match[0].length;
    const isAtResponseEnd = matchEnd >= response.length - 2;
    const hasTerminator = response.substring(matchEnd).trim().startsWith('// --- End File ---');

    if (isAtResponseEnd && !hasTerminator && !isStructured) {
      const lastLine = lines[lines.length - 1]?.trim() || '';
      // If the last line is a single character or a partial tag, it's likely truncated
      if (lastLine.length <= 2 && /^[a-z<]$/i.test(lastLine)) {
        console.warn(
          `[Processor] Block for ${filePath} appears truncated. Skipping to prevent corruption.`,
        );
        match = fileRegex.exec(response);
        continue;
      }
    }

    // Check for [...] block format: [ code ]
    if (content.startsWith('[') && content.endsWith(']')) {
      content = content.substring(1, content.length - 1).trim();
    }

    // Overwrite previous block for the same file path if it exists (handles AI self-correction)
    fileBlocksMap.set(filePath, content);
    match = fileRegex.exec(response);
  }

  const fileBlocks = Array.from(fileBlocksMap.entries()).map(([filePath, content]) => ({
    filePath,
    content,
  }));

  // Fallback if no markers found but we have an active tab
  if (fileBlocks.length === 0 && activeTabId) {
    const codeBlockRegex = /```[a-z]*\n([\s\S]*?)```/g;
    const blockMatch = codeBlockRegex.exec(response);
    const contentToProcess = blockMatch ? blockMatch[1] : response;

    if (contentToProcess && contentToProcess.trim().length > 10) {
      fileBlocks.push({
        filePath: activeTabId,
        content: contentToProcess.trim(),
      });
    }
  }

  return fileBlocks;
}
