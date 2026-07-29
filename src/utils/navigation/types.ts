export type FileContents = Record<string, string>;

export type CssImport = {
  identifier: string | null;
  importPath: string;
};

export type ImportRange = {
  path: string;
  start: number;
  end: number;
};

export type ImportSource = {
  importPath: string;
  isDefault?: boolean;
  isNamespace?: boolean;
  originalName: string | null;
};

export type SourceLocation = {
  line: number;
  col: number;
  index: number;
};

export function requireSourceIndex(loc: SourceLocation | null | undefined): number {
  if (!loc || loc.index == null) throw new Error('expected source location index');
  return loc.index;
}

export type JsToken = {
  type: string;
  value: string;
  start: number;
  end: number;
};

export type CssSearchResult = {
  filePath: string;
  fileName: string;
  loc: SourceLocation;
};

export type StyleAtCursor = {
  className: string;
  identifier: string | null;
};

export type ExportRange = {
  type: string;
  name: string;
  isDefault: boolean;
  start: number;
  end: number;
};

export type NavigationTarget = {
  type: string;
  name?: string;
  className?: string;
  resolvedPath?: string;
  start: number;
  end: number;
  targets: Array<{
    filePath: string;
    fileName: string;
    loc: SourceLocation;
  }>;
};

export type VariableTarget = {
  type: string;
  name: string;
  start: number;
  end: number;
  targets: Array<{
    filePath: string;
    fileName: string;
    loc: SourceLocation;
  }>;
};
