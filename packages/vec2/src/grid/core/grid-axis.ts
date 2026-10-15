import { Epsilon } from '../../core/epsilon';
import { Interval2, type Interval2Json } from '../../bounds/interval2';
import { GRID_MAX_INDEX, GRID_MIN_INDEX } from './limits';

export type AxisKind = 'unit' | 'uniform' | 'custom';

/**
 * One grid axis: maps integer indexes to consecutive local-space intervals.
 * Index 0’s low edge is at local 0; negative indexes extend below the origin.
 *
 * {@link Axis.kind} is derived from state:
 * - custom: has ≥1 custom size
 * - unit: no customs, default size ≈ 1
 * - uniform: no customs, default size ≉ 1
 */
export class Axis {
  static readonly type = 'Axis' as const;
  static readonly epsilon = Epsilon.preferIn;

  /** Absolute index limits used when no domain is set (matches hashable GridCell2 range). */
  static readonly limits = new Interval2(GRID_MIN_INDEX, GRID_MAX_INDEX);

  private _defaultSize: number;
  private _customSizes: Record<number, number> | null;
  private _domain: Interval2 | null;

  private constructor(defaultSize: number, customSizes: Record<number, number> | null, domain: Interval2 | null) {
    this._defaultSize = defaultSize;
    this._customSizes = customSizes;
    this._domain = Axis.constrainDomain(domain);
    this.assertConsistentState();
  }

  /**
   * Derived from custom sizes and default size.
   * @see class docs
   */
  kind(): AxisKind {
    if (this._customSizes !== null) {
      return 'custom';
    }
    if (Axis.epsilon.areEqual(1, this._defaultSize)) {
      return 'unit';
    }
    return 'uniform';
  }

  domain(): Interval2 | null {
    return this._domain;
  }

  setDomain(domain: Interval2 | null): void {
    this._domain = Axis.constrainDomain(domain);
  }

  /** Uniform axis with interval length 1. */
  static unit(domain: Interval2 | null = null): Axis {
    return new Axis(1, null, domain);
  }

  private static assertPositiveSize(size: number, label: string): void {
    if (!(size > Axis.epsilon.value)) {
      throw new Error(`${label} must be positive`);
    }
  }

  /** All indexes share the same interval length. Size ≈ `1` becomes {@link Axis.unit}. */
  static uniform(size: number, domain: Interval2 | null = null): Axis {
    Axis.assertPositiveSize(size, 'Axis uniform size');
    return new Axis(size, null, domain);
  }

  /** Default length plus per-index overrides (at least one required). */
  static custom(defaultSize: number, sizes: Record<number, number>, domain: Interval2 | null = null): Axis {
    Axis.assertPositiveSize(defaultSize, 'Axis default size');
    const axis = new Axis(defaultSize, null, domain);
    for (const [index, size] of Object.entries(sizes)) {
      axis.setSize(Number(index), size);
    }
    if (axis._customSizes === null) {
      throw new Error('Axis.custom requires at least one custom size');
    }
    return axis;
  }

  private static constrainDomain(domain: Interval2 | null): Interval2 | null {
    return domain ? Interval2.clampedInteger(domain, Axis.limits) : domain;
  }

  private assertConsistentState(): void {
    if (this._customSizes !== null && Object.keys(this._customSizes).length === 0) {
      throw new Error('Axis customSizes must be null when empty');
    }
  }

  /** True when this axis is the unit kind (default size 1, no overrides). */
  isUnit(): boolean {
    return this.kind() === 'unit';
  }

  /** True when all intervals share one fixed length (unit or uniform). */
  isUniform(): boolean {
    return this.kind() === 'unit' || this.kind() === 'uniform';
  }

  isConstrained(): boolean {
    return this.domain() !== null;
  }

  /** Effective index domain: explicit {@link domain}, otherwise {@link Axis.limits}. */
  indexDomain(): Interval2 {
    return this.domain() ?? Axis.limits;
  }

  containsIndex(index: number): boolean {
    return this.indexDomain().contains(index);
  }

  /** Local-space length of the interval at `index`. Throws if out of domain. */
  size(index: number): number {
    if (!this.containsIndex(index)) {
      throw new Error('Axis index out of domain');
    }
    return this.rawSize(index);
  }

  /** Length every index without an override has (exactly 1 for a unit axis). */
  private baseSize(): number {
    return this.kind() === 'unit' ? 1 : this._defaultSize;
  }

  /** Length at `index` regardless of the domain; the layout is defined for every index. */
  private rawSize(index: number): number {
    return this._customSizes?.[index] ?? this.baseSize();
  }

  /**
   * Local coordinate of the low edge of interval `index`.
   * Index 0 starts at 0 and negative indexes extend below the origin, also when the domain excludes 0.
   * Valid for `domain.min … domain.max + 1` (the last is the exclusive high lattice edge).
   */
  edge(index: number): number {
    const domain = this.indexDomain();
    if (index < domain.min || index > domain.max + 1) {
      throw new Error('Axis index out of domain');
    }

    const base = this.baseSize();
    let offset = index * base;
    for (const [key, size] of Object.entries(this._customSizes ?? {})) {
      const k = Number(key);
      if (index >= 0 && k >= 0 && k < index) offset += size - base;
      if (index < 0 && k >= index && k < 0) offset -= size - base;
    }
    return offset;
  }

  /** Map a local coordinate to its interval index, or `null` when it falls outside the domain. */
  indexAt(coord: number): number | null {
    const domain = this.indexDomain();

    if (this.kind() !== 'custom') {
      const index = Math.floor(coord / this.baseSize());
      return index >= domain.min && index <= domain.max ? index : null;
    }

    if (coord >= 0) {
      const search = domain.intersect(Interval2.ray);
      if (!search) return null;

      let low = this.edge(search.min);
      for (const index of search.countUp()) {
        const high = low + this.rawSize(index);
        if (coord >= low && coord < high) return index;
        if (coord < low) return null;
        low = high;
      }
      return null;
    }

    const search = domain.intersect(Interval2.negativeRay);
    if (!search) return null;

    let high = this.edge(search.max + 1);
    for (const index of search.countDown()) {
      const low = high - this.rawSize(index);
      if (coord >= low && coord < high) return index;
      if (coord >= high) return null;
      high = low;
    }
    return null;
  }

  /**
   * Override size at `index`. Promotes unit/uniform to custom; clearing the last override
   * demotes back to unit/uniform.
   */
  setSize(index: number, size: number, epsilon: Epsilon = Epsilon.preferIn): this {
    Axis.assertPositiveSize(size, 'Axis size');
    if (!this.containsIndex(index)) {
      throw new Error('Axis index out of domain');
    }
    const isDefaultSize = epsilon.areEqual(size, this._defaultSize);
    const customSizes = this._customSizes ?? {};

    if (isDefaultSize) {
      delete customSizes[index];
    } else {
      customSizes[index] = size;
    }

    if (Object.keys(customSizes).length === 0) {
      this._customSizes = null;
    } else {
      this._customSizes = customSizes;
    }

    return this;
  }

  withDomain(domain: Interval2 | null): Axis {
    return new Axis(this._defaultSize, this._customSizes ? { ...this._customSizes } : null, domain);
  }

  /** Default interval length for unit / uniform / custom axes. */
  defaultSize(): number {
    return this._defaultSize;
  }

  customSizes(): Readonly<Record<number, number>> {
    return this._customSizes ?? {};
  }

  clone(): Axis {
    return new Axis(
      this._defaultSize,
      this._customSizes ? { ...this._customSizes } : null,
      this.domain()?.clone() ?? null,
    );
  }

  toJson(): AxisJson {
    const domain = this.domain()?.toJson();

    switch (this.kind()) {
      case 'unit':
        return { kind: 'unit', ...(domain ? { domain } : {}) };
      case 'uniform':
        return { kind: 'uniform', size: this._defaultSize, ...(domain ? { domain } : {}) };
      case 'custom':
        return {
          kind: 'custom',
          defaultSize: this._defaultSize,
          sizes: { ...this._customSizes! } as Record<number, number>,
          ...(domain ? { domain } : {}),
        };
    }
  }
}

type AxisJsonBase = {
  domain?: Interval2Json;
};

export type AxisJson =
  | ({ kind: 'unit' } & AxisJsonBase)
  | ({ kind: 'uniform'; size: number } & AxisJsonBase)
  | ({ kind: 'custom'; defaultSize: number; sizes: Record<number, number> } & AxisJsonBase);
