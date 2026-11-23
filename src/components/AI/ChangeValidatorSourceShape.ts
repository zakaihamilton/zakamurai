import { stripComments } from './ChangeValidatorSyntax';

export const isAppEntryPath = (path: string): boolean =>
  /(?:^|\/)(?:App|main|index)\.(?:jsx|tsx)$/i.test(path);

/** Rejects comment-only scaffolding and non-code prose that claims to be an implementation. */
export function validateGeneratedPlaceholder(path: string, content: string): string | null {
  if (typeof content !== 'string') return null;
  const sourceShapeError = validateGeneratedSourceShape(path, content);
  if (sourceShapeError) return sourceShapeError;
  if (
    isAppEntryPath(path) &&
    (/<h1>\s*New Project\s*<\/h1>/i.test(content) || /Start coding here\.\.\./i.test(content))
  ) {
    return `Generated content for ${path} still looks like the starter template. Replace the starter screen with the requested implementation.`;
  }
  const stripped = stripComments(content).trim();
  if (!stripped) {
    if (
      !/(?:your\s+)?implementation\b|goes\s+here|insert\s+(?:code|implementation)|\bTODO\b/i.test(
        content,
      )
    ) {
      return null;
    }
    return `Generated content for ${path} is only a placeholder. Return a complete working implementation instead.`;
  }

  if (!/\.(?:jsx|tsx)$/i.test(path)) return null;

  // Stylesheet-shaped payloads are handled by validateFileContentType.
  if (
    /^(?:@(?:container|font-face|import|keyframes|layer|media|supports)\b|:root\b|[.#*\[]|(?:[a-z][\w-]*)(?:\s*\{|\s*[>+~]\s*|\s+|\s*,\s*[.#:]?)[^{]*\{)/i.test(
      stripped,
    )
  ) {
    return null;
  }

  const looksLikeSource =
    /^(?:async\s+)?(?:class|const|enum|export|function|import|interface|let|type|var)\b/m.test(
      stripped,
    ) ||
    /\b(?:export\s+default|function\s+[A-Za-z_$]|=>\s*[{(]|return\s*[(<]|use(?:State|Effect|Memo|Callback|Ref)\s*\(|<[A-Za-z][\w.]*)/.test(
      stripped,
    );
  if (!looksLikeSource) {
    return `Generated content for ${path} is not valid source code. Return a complete working implementation instead of prose or a request paraphrase.`;
  }
  return null;
}

/** Reject common small-model payloads that are balanced but target the wrong source boundary. */
export function validateGeneratedSourceShape(path: string, content: string): string | null {
  if (!/\.(?:jsx|tsx)$/i.test(path) || typeof content !== 'string') return null;

  if (isAppEntryPath(path) && /\bReactDOM\.(?:createRoot|render)\s*\(/.test(content)) {
    return `Generated component ${path} contains ReactDOM bootstrap code. Return only the component source; keep createRoot/render in the existing entry file.`;
  }

  if (/(?:<!DOCTYPE\s+html\b|<html[\s>])/i.test(content)) {
    return `Generated component ${path} contains an HTML document. Return only the React component module source.`;
  }

  if (/<style\b/i.test(content)) {
    return `Generated component ${path} contains a <style> tag. Move visual rules to the co-located CSS Module instead.`;
  }

  if (
    /\b(?:const|let|var)\s+styles\s*=\s*\{[\s\S]*?\b(?:display|position|background(?:-color)?|color|padding|margin|width|height|min-height|border-radius)\s*:/.test(
      content,
    )
  ) {
    return `Generated component ${path} contains a CSS-style object. Move visual rules to the co-located CSS Module and use the imported styles class map.`;
  }

  if (/```/.test(content)) {
    return `Generated component ${path} contains a nested code fence. Return the complete source without markdown fences inside the file.`;
  }

  const defaultExports = content.match(/\bexport\s+default\b/g) || [];
  if (defaultExports.length > 1) {
    return `Generated component ${path} contains multiple default exports. Return exactly one default-exported component.`;
  }

  if (
    isAppEntryPath(path) &&
    /\bdocument\.(?:getElementById|querySelector|querySelectorAll)\s*\(/.test(content)
  ) {
    return `Generated component ${path} queries the document DOM directly. Return component JSX only; keep DOM mounting in the existing entry file.`;
  }

  const trimmed = content.trimEnd();
  if (
    /(?:\.\.\.|…)\s*$/.test(trimmed) ||
    /(?:\/\/\s*(?:TODO|FIXME|implementation goes here)|\/\*\s*(?:TODO|FIXME)\b)[^\n]*$/i.test(
      trimmed,
    )
  ) {
    return `Generated content for ${path} looks truncated or unfinished. Return the complete working source file.`;
  }

  return null;
}

/** Keeps small generated apps on local state instead of adding unrequested state libraries. */
export function validateForbiddenStateLibraryUsage(path: string, content: string): string | null {
  if (typeof content !== 'string') return null;
  const forbiddenPackage = /^(?:@reduxjs\/toolkit|redux|recoil|zustand)(?:\/|$)/i;
  const isPackageManifest = /(?:^|\/)package\.json$/i.test(path);
  const usesForbiddenPackage = isPackageManifest
    ? /["'](?:@reduxjs\/toolkit|redux|recoil|zustand)["']\s*:/i.test(content)
    : /(?:from\s*|require\(\s*|import\s*\(\s*)["'][^"']+["']/i.test(content) &&
      [...content.matchAll(/(?:from\s*|require\(\s*|import\s*\(\s*)["']([^"']+)["']/gi)].some(
        (match) => forbiddenPackage.test(match[1]),
      );
  return usesForbiddenPackage
    ? `Do not introduce Redux, Zustand, Recoil, or another unrequested state library in ${path}. Use React local state or plain browser state instead.`
    : null;
}
