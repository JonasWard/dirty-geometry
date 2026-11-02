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
import { formChoices } from '../model/ops';
import { operationLabel } from '../operations';
import { useFavourites } from '../store';

export type PaletteEntry =
  | { group: string; label: string; search: string; expr: Expr }
  | { group: string; label: string; search: string; input: string };

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
  for (const choice of formChoices(undefined, 'unknown', fns))
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

const choice =
  'block w-full truncate rounded px-1.5 py-0.5 text-left font-mono text-[11px] hover:bg-dg-sky-100 focus:bg-dg-sky-100 focus:outline-none';

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
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = all.filter((e) => words.every((w) => `${e.group} ${e.search}`.toLowerCase().includes(w))).slice(0, 80);
  const groups = [...new Set(found.map((e) => e.group))];
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
      className='absolute z-20 w-72 rounded-md border border-dg-border bg-white p-2 text-xs shadow-lg'
      style={{ left: at.x, top: at.y }}
    >
      <input
        autoFocus
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
      <div className='max-h-72 overflow-y-auto'>
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
        {!found.length && <p className='px-1 text-dg-subtle'>Nothing matches.</p>}
      </div>
    </div>
  );
}
