export const MAX_EDITOR_ANALYSIS_CHARS = 250000;
export const MAX_EDITOR_ANALYSIS_LINES = 2000;

export function shouldDeferEditorAnalysis(content = '') {
  if (content.length > MAX_EDITOR_ANALYSIS_CHARS) return true;
  let lines = 1;
  for (let index = 0; index < content.length; index++) {
    if (content.charCodeAt(index) === 10 && ++lines > MAX_EDITOR_ANALYSIS_LINES) return true;
  }
  return false;
}
