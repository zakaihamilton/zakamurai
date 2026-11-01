export type StreamInterceptionResult =
  | {
      action: 'complete';
      text: string;
      reason: 'closed-fence';
    }
  | {
      action: 'abort-malformed';
      text: string;
      reason: 'repetition-loop' | 'html-document' | 'forbidden-state-library';
      diagnostic: string;
    };

/**
 * Detects degenerate repetition loops in a streaming local-model completion
 * (for example, an identical non-trivial line repeated >= 5 times consecutively
 * or a 40+ character phrase repeated >= 4 times back-to-back).
 */
export function hasDegenerateStreamRepetition(text: string): boolean {
  if (text.length < 220) return false;
  const tail = text.slice(-1200);
  const lines = tail
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= 18);

  if (lines.length >= 5) {
    let consecutive = 1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === lines[i - 1]) {
        consecutive += 1;
        if (consecutive >= 5) return true;
      } else {
        consecutive = 1;
      }
    }
  }

  // Also detect repeated multi-word 32+ char substrings without newlines.
  const phraseRepeat = /(.{32,120}?)\1{3,}/s;
  return phraseRepeat.test(tail);
}

/**
 * Inspects a live WebLLM stream during `askWebLLM` `onUpdate` so small models
 * can fail fast on fatal source boundary violations or stop cleanly right after
 * closing their first code fence without streaming trailing prose or a second file.
 */
export function inspectStreamingActionOutput({
  output,
  lightweightModel,
}: {
  output: string;
  lightweightModel: boolean;
}): StreamInterceptionResult | null {
  if (output.length < 160) return null;

  if (hasDegenerateStreamRepetition(output)) {
    return {
      action: 'abort-malformed',
      text: output,
      reason: 'repetition-loop',
      diagnostic: 'Stream aborted early due to degenerate token repetition loop.',
    };
  }

  // If the model already emitted a complete action JSON + closed fence or fence-only block,
  // and is now generating trailing prose or a second code fence, truncate cleanly at the first closed fence.
  const closedFenceMatch =
    /^(?:\s*\{[^\n]*?"action"\s*:\s*"write_file"[^\n]*\}\s*\n)?\s*(```(?:jsx|tsx|js|ts|css|json|html)?\s*\n[\s\S]{80,}?\n```)\s*\n+(\S[\s\S]{25,})$/i.exec(
      output,
    );
  if (closedFenceMatch && lightweightModel) {
    const prefixEnd = output.indexOf(closedFenceMatch[1]) + closedFenceMatch[1].length;
    return {
      action: 'complete',
      text: output.slice(0, prefixEnd),
      reason: 'closed-fence',
    };
  }

  // Detect fatal HTML document payloads inside a JSX/TSX code fence early.
  if (/```(?:jsx|tsx)\s*\n[\s\S]{0,200}?(?:<!DOCTYPE\s+html\b|<html[\s>])/i.test(output)) {
    return {
      action: 'abort-malformed',
      text: `${output}\n\`\`\``,
      reason: 'html-document',
      diagnostic: 'Stream aborted early because JSX fence began with an HTML document.',
    };
  }

  // Detect forbidden state library imports early in the stream.
  if (
    /```(?:jsx|tsx|js|ts)\s*\n[\s\S]{0,400}?\bfrom\s*["'](?:@reduxjs\/toolkit|redux|zustand|recoil)["']/i.test(
      output,
    )
  ) {
    return {
      action: 'abort-malformed',
      text: `${output}\n\`\`\``,
      reason: 'forbidden-state-library',
      diagnostic: 'Stream aborted early due to forbidden state library import.',
    };
  }

  return null;
}
