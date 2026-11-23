import type { FileMap } from '@/components/AI/types';

export type ProjectStyleProfileSource = 'inferred' | 'default';

export type ProjectStyleTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  border: string;
  danger: string;
  fontFamily: string;
  spacing: string;
  radius: string;
  shadow: string;
  duration: string;
  easing: string;
};

export type ProjectStyleProfile = {
  source: ProjectStyleProfileSource;
  fingerprint: string;
  tokens: ProjectStyleTokens;
};

export const PROJECT_STYLE_ROLES = [
  'app',
  'shell',
  'section',
  'stack',
  'row',
  'grid',
  'card',
  'title',
  'subtitle',
  'label',
  'muted',
  'status',
  'field',
  'control',
  'primaryAction',
  'secondaryAction',
  'dangerAction',
  'list',
  'item',
  'checkbox',
  'toggle',
  'form',
  'active',
  'selected',
  'completed',
  'error',
  'success',
] as const;

const WARM_LIGHT_TOKENS: ProjectStyleTokens = {
  background: '#f5f1ea',
  surface: '#fffdf8',
  surfaceAlt: '#eee6da',
  text: '#292521',
  muted: '#6f655b',
  accent: '#a4472f',
  onAccent: '#ffffff',
  border: '#d8cdbf',
  danger: '#b42318',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  spacing: '1rem',
  radius: '0.75rem',
  shadow: '0 14px 36px rgb(68 52 39 / 0.12)',
  duration: '160ms',
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
};

const CHARCOAL_DARK_TOKENS: ProjectStyleTokens = {
  background: '#171817',
  surface: '#232522',
  surfaceAlt: '#30332f',
  text: '#f7f3ea',
  muted: '#bbb5aa',
  accent: '#d59a54',
  onAccent: '#20170d',
  border: '#454943',
  danger: '#ff8a80',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  spacing: '1rem',
  radius: '0.75rem',
  shadow: '0 18px 44px rgb(0 0 0 / 0.3)',
  duration: '160ms',
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
};

const hash = (value: string): string => {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16);
};

export const fingerprintProjectCss = (files: FileMap): string =>
  hash(
    Object.entries(files)
      .filter(([path]) => /\.css$/i.test(path))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, content]) => `${path}:${content.length}:${hash(content)}`)
      .join('|'),
  );

const firstCustomProperty = (css: string, names: RegExp[]): string | null => {
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) {
    if (names.some((name) => name.test(match[1]))) return match[2].trim();
  }
  return null;
};

const valuesByFrequency = (values: string[]): string[] => {
  const counts = new Map<string, { count: number; first: number }>();
  values.forEach((value, index) => {
    const current = counts.get(value);
    counts.set(value, { count: (current?.count || 0) + 1, first: current?.first ?? index });
  });
  return [...counts.entries()]
    .sort(([, left], [, right]) => right.count - left.count || left.first - right.first)
    .map(([value]) => value);
};

const parseHex = (value: string): [number, number, number] | null => {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
  if (!hex) return null;
  const normalized = hex.length === 3 ? [...hex].map((part) => `${part}${part}`).join('') : hex;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

export const luminance = (value: string): number | null => {
  const rgb = parseHex(value);
  if (!rgb) return null;
  const channels = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

export const readableTextFor = (background: string): string =>
  (luminance(background) ?? 0.5) < 0.35 ? '#ffffff' : '#20170d';

const inferTokens = (files: FileMap): ProjectStyleTokens | null => {
  const cssEntries = Object.entries(files)
    .filter(([path]) => /\.css$/i.test(path))
    .sort(([left], [right]) => {
      const leftRoot = /(?:^|\/)App\.module\.css$/i.test(left) ? 1 : 0;
      const rightRoot = /(?:^|\/)App\.module\.css$/i.test(right) ? 1 : 0;
      return rightRoot - leftRoot || left.localeCompare(right);
    });
  if (!cssEntries.length) return null;
  const css = cssEntries.map(([, content]) => content).join('\n');
  const colors = valuesByFrequency(
    [...css.matchAll(/#[\da-f]{3,8}\b/gi)].map((match) => match[0].toLowerCase()),
  );
  const backgrounds = valuesByFrequency(
    [...css.matchAll(/background(?:-color)?\s*:\s*(#[\da-f]{3,8})\b/gi)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  const textColors = valuesByFrequency(
    [...css.matchAll(/(?:^|[;{])\s*color\s*:\s*(#[\da-f]{3,8})\b/gim)].map((match) =>
      match[1].toLowerCase(),
    ),
  );
  const customBackground = firstCustomProperty(css, [/background|\bbg\b/i]);
  const background = customBackground || backgrounds[0] || colors[0];
  if (!background) return null;
  const dark = (luminance(background) ?? 0.6) < 0.28;
  const fallback = dark ? CHARCOAL_DARK_TOKENS : WARM_LIGHT_TOKENS;
  const accent =
    firstCustomProperty(css, [/accent|primary|brand/i]) ||
    colors.find((color) => color !== background && color !== textColors[0]) ||
    fallback.accent;
  const spacing =
    firstCustomProperty(css, [/spacing|space|gap/i]) ||
    valuesByFrequency(
      [...css.matchAll(/(?:gap|padding)\s*:\s*([\d.]+(?:rem|px))/gi)].map((m) => m[1]),
    )[0] ||
    fallback.spacing;
  const radius =
    firstCustomProperty(css, [/radius/i]) ||
    valuesByFrequency(
      [...css.matchAll(/border-radius\s*:\s*([^;{}]+)/gi)].map((m) => m[1].trim()),
    )[0] ||
    fallback.radius;
  const fontFamily =
    firstCustomProperty(css, [/font.*family|font-sans/i]) ||
    css.match(/font-family\s*:\s*([^;{}]+)/i)?.[1]?.trim() ||
    fallback.fontFamily;
  return {
    ...fallback,
    background,
    surface:
      firstCustomProperty(css, [/surface|panel|card/i]) || backgrounds[1] || fallback.surface,
    surfaceAlt: firstCustomProperty(css, [/surface.*alt|muted.*surface/i]) || fallback.surfaceAlt,
    text:
      firstCustomProperty(css, [/foreground|\btext\b|\bfg\b/i]) || textColors[0] || fallback.text,
    muted: firstCustomProperty(css, [/muted|secondary.*text/i]) || textColors[1] || fallback.muted,
    accent,
    onAccent: firstCustomProperty(css, [/on.*(?:accent|primary)/i]) || readableTextFor(accent),
    border: firstCustomProperty(css, [/border/i]) || fallback.border,
    danger: firstCustomProperty(css, [/danger|error|destructive/i]) || fallback.danger,
    fontFamily,
    spacing,
    radius,
    shadow:
      firstCustomProperty(css, [/shadow/i]) ||
      css.match(/box-shadow\s*:\s*([^;{}]+)/i)?.[1]?.trim() ||
      fallback.shadow,
    duration:
      firstCustomProperty(css, [/duration|transition/i]) ||
      css.match(/\b(\d+(?:\.\d+)?(?:ms|s))\b/)?.[1] ||
      fallback.duration,
  };
};

export const createProjectStyleProfile = (files: FileMap): ProjectStyleProfile => {
  const fingerprint = fingerprintProjectCss(files);
  const inferred = inferTokens(files);
  return {
    source: inferred ? 'inferred' : 'default',
    fingerprint,
    tokens: inferred || WARM_LIGHT_TOKENS,
  };
};

export const resolveProjectStyleProfile = (
  files: FileMap,
  current?: ProjectStyleProfile | null,
): ProjectStyleProfile => {
  const fingerprint = fingerprintProjectCss(files);
  // Do not reuse a persisted profile created by the former override dropdown.
  if (current && (current.source as string) !== 'override' && current.fingerprint === fingerprint) {
    return current;
  }
  return createProjectStyleProfile(files);
};
