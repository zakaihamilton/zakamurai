type PromptfooContext = {
  vars?: Record<string, string>;
};

type PromptfooResult = boolean | { pass: boolean; reason?: string };

export function assertCssModules(_output: string, context: PromptfooContext): PromptfooResult {
  const vars = context?.vars || {};
  const content = vars.file_content || '';
  const hasCssModule = /import .* from ['"].*\.module\.css['"]/.test(content);
  const hasInlineStyles = /style=\{\{/.test(content);
  const hasTailwind = /className=['"].*(?:bg-|text-|p-|m-|flex|grid).*['"]/.test(content);
  if (!hasCssModule && /return \(/.test(content)) {
    return { pass: false, reason: 'Missing CSS Module import in UI component' };
  }
  if (hasInlineStyles) return { pass: false, reason: 'Inline styles forbidden' };
  if (hasTailwind) return { pass: false, reason: 'Tailwind forbidden' };
  return true;
}

export function assertStateProxy(_output: string, context: PromptfooContext): PromptfooResult {
  const vars = context?.vars || {};
  const content = vars.file_content || '';
  const hasForbiddenUseState = /const \[.*, set.*\] = useState\(.*State.*\)/i.test(content);
  if (hasForbiddenUseState) {
    return {
      pass: false,
      reason: 'React useState is forbidden for shared domain state. Use Node/Object Proxy State.',
    };
  }
  return true;
}

export function assertSearchReplace(_output: string, context: PromptfooContext): PromptfooResult {
  const vars = context?.vars || {};
  const content = vars.diff_content || '';
  const hasSearch = /<<<<<<< SEARCH/.test(content);
  const hasDivider = /=======/.test(content);
  const hasReplace = />>>>>>> REPLACE/.test(content);
  if (!hasSearch || !hasDivider || !hasReplace) {
    return { pass: false, reason: 'Malformed SEARCH/REPLACE diff format' };
  }
  return true;
}

export function assertValidGoldenDiff(_output: string, context: PromptfooContext): PromptfooResult {
  const vars = context?.vars || {};
  const content = vars.diff_content || '';
  const hasSearch = /<<<<<<< SEARCH/.test(content);
  const hasDivider = /=======/.test(content);
  const hasReplace = />>>>>>> REPLACE/.test(content);
  if (!hasSearch || !hasDivider || !hasReplace) {
    return { pass: false, reason: 'Valid golden fixture must include full SEARCH/REPLACE markers' };
  }
  return true;
}

export function assertMalformedGoldenDiff(
  _output: string,
  context: PromptfooContext,
): PromptfooResult {
  const vars = context?.vars || {};
  const content = vars.diff_content || '';
  const hasReplace = />>>>>>> REPLACE/.test(content);
  if (hasReplace) {
    return { pass: false, reason: 'Malformed golden fixture should not include REPLACE marker' };
  }
  return true;
}

export function assertUnsafePaths(_output: string, context: PromptfooContext): PromptfooResult {
  const vars = context?.vars || {};
  const data = JSON.parse(vars.paths_json || '{}') as {
    unsafePaths?: string[];
    safePaths?: string[];
  };
  const absolute = /^(?:\/|\\|[A-Za-z]:)/;
  const traversal = /\.\.|\\/;
  for (const path of data.unsafePaths || []) {
    if (!absolute.test(path) && !traversal.test(path)) {
      return { pass: false, reason: `Expected unsafe path classification for ${path}` };
    }
  }
  for (const path of data.safePaths || []) {
    if (absolute.test(path) || traversal.test(path)) {
      return { pass: false, reason: `Expected safe path classification for ${path}` };
    }
  }
  return true;
}

export function assertTailwindViolation(_output: string, context: PromptfooContext): PromptfooResult {
  const vars = context?.vars || {};
  const content = vars.file_content || '';
  const hasTailwind = /className=['"].*(?:bg-|text-|p-|m-|flex|grid).*['"]/.test(content);
  if (!hasTailwind) {
    return { pass: false, reason: 'Tailwind violation fixture must include utility classes' };
  }
  return true;
}

export function assertInlineStyleViolation(
  _output: string,
  context: PromptfooContext,
): PromptfooResult {
  const vars = context?.vars || {};
  const content = vars.file_content || '';
  const hasCssModule = /import .* from ['"].*\.module\.css['"]/.test(content);
  const hasInlineStyles = /style=\{\{/.test(content);
  if (!hasCssModule || !hasInlineStyles) {
    return {
      pass: false,
      reason: 'Inline style violation fixture must import CSS Module and use inline style',
    };
  }
  return true;
}

export function assertDomainUseStateViolation(
  _output: string,
  context: PromptfooContext,
): PromptfooResult {
  const vars = context?.vars || {};
  const content = vars.file_content || '';
  const hasForbiddenUseState = /const\s+\[[^\]]+\]\s*=\s*useState\s*\(/.test(content);
  const importsDomain = /EditorState/.test(content);
  if (!hasForbiddenUseState || !importsDomain) {
    return {
      pass: false,
      reason: 'Domain useState violation fixture must use useState with EditorState',
    };
  }
  return true;
}
