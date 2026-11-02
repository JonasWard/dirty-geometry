/**
 * The node view's own settings, per viewer: the characters its buttons show, and whether ports show their values.
 * Kept in this browser only (a convenience; nothing else needs them), and safe without storage.
 */
import { useCallback, useEffect, useState } from 'react';

/** Every button of the node view, with the character it shows. */
export const ICON_DEFAULTS = {
  add: '+',
  select: '⬚',
  newCluster: '⧉',
  values: '#',
  settings: '⚙',
  help: '?',
  more: '⋯',
  drawing: '▣',
  back: '‹',
  open: '⤢',
  rename: '✎',
  output: '◎',
  makeCluster: '⧉',
  delete: '✕',
  removeWire: '✂',
  param: '+',
  dissolve: '⇲',
} as const;
export type IconName = keyof typeof ICON_DEFAULTS;
export type Icons = Record<IconName, string>;
export const ICON_LABELS: Record<IconName, string> = {
  add: 'add a node',
  select: 'select several',
  newCluster: 'new cluster',
  values: 'show values',
  settings: 'settings',
  help: 'help',
  more: 'more buttons',
  drawing: 'show the drawing',
  back: 'back to main',
  open: 'open',
  rename: 'name',
  output: 'output',
  makeCluster: 'make cluster',
  delete: 'delete',
  removeWire: 'remove wire',
  param: 'add param',
  dissolve: 'dissolve',
};

const KEY = 'dirty-geometry.nodes.prefs';
export type NodePrefs = { icons: Icons; showValues: boolean };

/** Ports show their values by default with a mouse; on a touch screen they stay hidden until the node is selected. */
const coarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
const defaults = (): NodePrefs => ({ icons: { ...ICON_DEFAULTS }, showValues: !coarse() });

function read(): NodePrefs {
  const base = defaults();
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<NodePrefs>;
    const icons = { ...base.icons };
    for (const name of Object.keys(ICON_DEFAULTS) as IconName[]) {
      const icon = stored.icons?.[name];
      if (typeof icon === 'string' && icon.trim()) icons[name] = [...icon.trim()].slice(0, 3).join('');
    }
    return { icons, showValues: typeof stored.showValues === 'boolean' ? stored.showValues : base.showValues };
  } catch {
    return base;
  }
}

export function useNodePrefs() {
  const [prefs, setPrefs] = useState<NodePrefs>(defaults);
  useEffect(() => setPrefs(read()), []);
  const update = useCallback((patch: Partial<NodePrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch, icons: { ...current.icons, ...patch.icons } };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // no storage (a private window): the setting lasts until the page closes
      }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}
