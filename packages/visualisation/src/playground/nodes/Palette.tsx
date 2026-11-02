'use client';

/**
 * Grasshopper's canvas search: double-click the canvas, type, pick. Offers the definition's clusters, every vec2
 * operation, the shared forms (math, logic, lists, random), values and inputs. A pick adds a node where the canvas
 * was clicked.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ARC_OPS, ARITHMETIC_BINARY_OPS, ARITHMETIC_UNARY_OPS, LOG_OPS, TRIG_OPS } from '@dirty-geometry/fn/math';
import type { Definition, Expr } from '@dirty-geometry/vec2/recording/definition';
import { isOptional, isRest, operations, slotType } from '@dirty-geometry/vec2/schema/schema';
import { roleOf } from '@dirty-geometry/vec2/schema/typing';
import { defaultLiteral } from '../defaults';
import { CALLBACK_OPS, type CallbackOp } from '../model/graph-edits';
import { formChoices } from '../model/ops';
import { operationLabel } from '../operations';
import { useFavourites } from '../store';

export type PaletteEntry =
  | { group: string; label: string; search: string; expr: Expr }
  | { group: string; label: string; search: string; input: string }
  /** A list form that calls a cluster: picking it also makes a cluster to call when none fits. */
  | { group: string; label: string; search: string; callback: CallbackOp };

/** An operation as a new node: number arguments start at their default, the others are left to wire. */
export function freshOp(id: string): Expr {
  const op = operations.find((o) => o.id === id)!;
  const args: Record<string, Expr> = {};
  for (const [name, slot] of op.params) {
    if (isOptional(slot) || isRest(slot)) continue;
    if (roleOf(slotType(slot))) args[name] = defaultLiteral(slotType(slot)) ?? 0;
  }
  return Object.keys(args).length ? { op: id, args } : { op: id };
}

export function paletteEntries(definition: Definition, favourites: readonly string[]): PaletteEntry[] {
  const fns = definition.functions;
  const entries: PaletteEntry[] = [];
  for (const fn of fns)
    entries.push({ group: 'Clusters', label: fn.name, search: `${fn.name} cluster function`, expr: { call: fn.name } });
  const ops = [...operations].sort(
    (a, b) => Number(favourites.includes(b.id)) - Number(favourites.includes(a.id)) || a.id.localeCompare(b.id),
  );
  for (const op of ops) {
    const { head, owner } = operationLabel(op.id);
    entries.push({
      group: 'Operations',
      label: owner ? `${owner} ${head}` : head,
      search: `${op.id} ${head}`,
      expr: freshOp(op.id),
    });
  }
  for (const op of ARITHMETIC_BINARY_OPS)
    entries.push({ group: 'Math', label: `x ${op} y`, search: `math ${op}`, expr: { math: op, args: [0, 1] } });
  for (const op of [...ARITHMETIC_UNARY_OPS, ...TRIG_OPS, ...ARC_OPS, ...LOG_OPS])
    entries.push({ group: 'Math', label: `${op}(x)`, search: `math ${op}`, expr: { math: op, args: [0] } });
  entries.push({
    group: 'Math',
    label: 'atan2(y, x)',
    search: 'math atan2 angle',
    expr: { math: 'atan2', args: [0, 1] },
  });
  const callbackWords: Record<CallbackOp, string> = {
    generate: 'generator range sequence repeat count',
    map: 'each transform',
    filter: 'keep where select',
    sort: 'order by',
  };
  for (const op of CALLBACK_OPS)
    entries.push({
      group: 'Lists',
      label: op === 'generate' ? 'generate(index, previous, count)' : `${op}(item, index)`,
      search: `list ${op} ${callbackWords[op]} cluster`,
      callback: op,
    });
  // The callback forms are listed above, whether or not a cluster exists yet.
  for (const choice of formChoices(undefined, 'unknown', fns).filter(
    (c) => !(c.expr && typeof c.expr === 'object' && 'fn' in c.expr),
  ))
    entries.push({
      group: choice.tab === 'logic' ? 'Logic' : choice.tab === 'list' ? 'Lists' : 'Random',
      label: choice.label,
      search: `${choice.tab} ${choice.label}`,
      expr: choice.expr,
    });
  entries.push({ group: 'Values', label: 'number', search: 'value number panel', expr: 0 });
  entries.push({ group: 'Values', label: 'true / false', search: 'value boolean toggle', expr: false });
  entries.push({ group: 'Values', label: '[ list ]', search: 'value list', expr: [] });
  for (const type of ['Coordinate', 'Length', 'Index', 'Integer', 'Radians', 'Parameter', 'boolean', 'Vec2'])
    entries.push({ group: 'Inputs', label: `input: ${type}`, search: `input slider ${type}`, input: type });
  return entries;
}

/** The entries matching every word of `query`, best first: a name that is the query, then one starting with it. */
export function searchPalette(entries: readonly PaletteEntry[], query: string, limit = 80): PaletteEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const q = words.join(' ');
  const rank = (e: PaletteEntry) => {
    const names = (e.label.match(/[\w$]+/g) ?? []).map((w) => w.toLowerCase());
    return names.includes(q) ? 0 : names.some((n) => n.startsWith(q)) ? 1 : 2;
  };
  return entries
    .filter((e) => words.every((w) => `${e.group} ${e.search}`.toLowerCase().includes(w)))
    .map((e, i) => ({ e, i, r: q ? rank(e) : 0 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ e }) => e)
    .slice(0, limit);
}

/** The groups, in the order the search lists them when nothing is typed. */
export const PALETTE_GROUPS = [
  'Clusters',
  'Math',
  'Lists',
  'Logic',
  'Random',
  'Values',
  'Inputs',
  'Operations',
] as const;
export type PaletteGroup = (typeof PALETTE_GROUPS)[number];
const opId = (e: PaletteEntry) =>
  'expr' in e && e.expr && typeof e.expr === 'object' && 'op' in e.expr ? e.expr.op : '';

/**
 * What the search shows: with a query, the matches (in `group` if one is picked); with none, a whole picked group, or
 * by default every small group in full and only the favourite operations (the other 490 are a tap away).
 */
export function browsePalette(
  entries: readonly PaletteEntry[],
  query: string,
  group: PaletteGroup | null,
  favourites: readonly string[],
): { entries: PaletteEntry[]; moreOperations: number } {
  const pool = group ? entries.filter((e) => e.group === group) : entries;
  if (query.trim()) return { entries: searchPalette(pool, query, group ? Infinity : 80), moreOperations: 0 };
  if (group) return { entries: [...pool], moreOperations: 0 };
  const ordered = PALETTE_GROUPS.flatMap((g) => entries.filter((e) => e.group === g));
  const shown = ordered.filter((e) => e.group !== 'Operations' || favourites.includes(opId(e)));
  return { entries: shown, moreOperations: entries.filter((e) => e.group === 'Operations').length };
}

const chip =
  'rounded-full border border-dg-border px-2 py-0.5 text-[10px] tracking-wide text-dg-subtle hover:border-dg-steel-600 coarse:px-3 coarse:py-1 coarse:text-xs';
const choice =
  'block w-full truncate rounded px-1.5 py-0.5 coarse:py-1.5 text-left font-mono text-[11px] hover:bg-dg-sky-100 focus:bg-dg-sky-100 focus:outline-none';

export function Palette({
  definition,
  at,
  onPick,
  onClose,
}: {
  definition: Definition;
  /** Where to show it, in the canvas element's pixels. */
  at: { x: number; y: number };
  onPick: (entry: PaletteEntry) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const favourites = useFavourites();
  const all = useMemo(() => paletteEntries(definition, favourites.ids), [definition, favourites.ids]);
  const [group, setGroup] = useState<PaletteGroup | null>(null);
  const { entries: found, moreOperations } = browsePalette(all, query, group, favourites.ids);
  const groups = [...new Set(found.map((e) => e.group))];
  const present = PALETTE_GROUPS.filter((g) => all.some((e) => e.group === g));
  // A finger browses first: on a touch screen the field does not take focus (and the keyboard stays down).
  const touch = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches, []);
  useEffect(() => {
    const outside = (event: MouseEvent) => ref.current && !ref.current.contains(event.target as Node) && onClose();
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [onClose]);
  return (
    <div
      ref={ref}
      role='dialog'
      aria-label='add a node'
      className='absolute z-20 w-[min(18rem,calc(100%-0.5rem))] rounded-md border border-dg-border bg-white p-2 text-xs shadow-lg'
      style={{ left: at.x, top: at.y }}
    >
      <input
        autoFocus={!touch}
        aria-label='search nodes'
        placeholder='search, e.g. circle, add, map'
        className='mb-1 w-full rounded border border-dg-border px-1.5 py-0.5 font-mono text-[11px]'
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'Enter' && found[0]) onPick(found[0]);
        }}
      />
      <div className='mb-1 flex flex-wrap gap-1' role='group' aria-label='node groups'>
        {present.map((g) => (
          <button
            key={g}
            type='button'
            aria-pressed={group === g}
            className={`${chip} ${group === g ? '!border-dg-navy-900 bg-dg-navy-900 !text-dg-sky-200' : ''}`}
            onClick={() => setGroup(group === g ? null : g)}
          >
            {g}
          </button>
        ))}
      </div>
      <div className='max-h-56 overflow-y-auto sm:max-h-72'>
        {groups.map((group) => (
          <div key={group}>
            <div className='mt-1 px-1 text-[10px] tracking-widest text-dg-subtle uppercase'>{group}</div>
            {found
              .filter((e) => e.group === group)
              .map((e) => (
                <button key={`${group}:${e.label}`} type='button' className={choice} onClick={() => onPick(e)}>
                  {e.label}
                </button>
              ))}
          </div>
        ))}
        {moreOperations > 0 && (
          <button type='button' className={`${choice} text-dg-steel-600`} onClick={() => setGroup('Operations')}>
            all {moreOperations} operations →
          </button>
        )}
        {!found.length && <p className='px-1 text-dg-subtle'>Nothing matches.</p>}
      </div>
    </div>
  );
}
