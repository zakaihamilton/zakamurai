import type { ShortcutDefinition, ShortcutGroup } from '@/components/App/types';
import { isMac } from '@/utils/os';
import { SHORTCUT_GROUPS } from './constants';
import { SHORTCUTS } from './definitions';

type ShortcutMatchInput = Pick<ShortcutDefinition, 'key' | 'modifier' | 'platform'>;

export const isMatch = (e: KeyboardEvent, s: ShortcutMatchInput): boolean => {
  const mac = isMac();
  if (s.platform === 'mac' && !mac) return false;
  if (s.platform === 'win' && mac) return false;

  const meta = e.metaKey;
  const ctrl = e.ctrlKey;
  const shift = e.shiftKey;
  const alt = e.altKey;

  const mod = s.modifier;

  let match = false;
  if (mod === 'cmd') {
    match = (mac ? meta : ctrl) && !shift && !alt;
  } else if (mod === 'cmd-shift') {
    match = (mac ? meta : ctrl) && shift && !alt;
  } else if (mod === 'ctrl') {
    match = ctrl && !meta && !shift && !alt;
  } else if (mod === 'ctrl-shift') {
    match = ctrl && shift && !meta && !alt;
  } else if (mod === 'ctrl-alt') {
    match = ctrl && alt && !meta && !shift;
  } else if (mod === 'cmd-alt') {
    match = (mac ? meta : ctrl) && alt && !shift;
  } else if (mod === 'alt') {
    match = alt && !meta && !ctrl && !shift;
  } else if (mod === 'shift') {
    match = shift && !meta && !ctrl && !alt;
  } else if (mod === 'none') {
    match = !meta && !ctrl && !shift && !alt;
  }

  if (!match) return false;

  const keys = Array.isArray(s.key) ? s.key : [s.key];
  return keys.some((k) => k.toLowerCase() === e.key.toLowerCase());
};

export const getShortcutsByGroup = (): ShortcutGroup[] => {
  const groups: Record<string, ShortcutGroup['items']> = {};
  const mac = isMac();
  for (const s of SHORTCUTS) {
    if (s.platform === 'mac' && !mac) continue;
    if (s.platform === 'win' && mac) continue;
    if (!groups[s.group]) groups[s.group] = [];
    if (!groups[s.group].some((item) => item.desc === s.desc)) {
      groups[s.group].push({
        id: s.id,
        key: s.displayKey,
        desc: s.desc,
      });
    }
  }

  const order = [
    SHORTCUT_GROUPS.NAVIGATION,
    SHORTCUT_GROUPS.AI,
    SHORTCUT_GROUPS.EDITOR,
    SHORTCUT_GROUPS.TABS,
    SHORTCUT_GROUPS.AI_PROMPT,
    SHORTCUT_GROUPS.GENERAL,
  ];

  return order.filter((name) => groups[name]).map((name) => ({ group: name, items: groups[name] }));
};
