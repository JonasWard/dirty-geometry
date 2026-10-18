import type { Coordinate, Integer, Radians } from './numbers';
import { Interval2 } from '../bounds/interval2';
import type { Vec2 } from './vec2';

export const TAU = 2 * Math.PI;

/** `Object.freeze` that keeps the class type (so private members still type-check). */
const frozen = <T extends object>(value: T): T => Object.freeze(value) as T;

/** Degrees-per-bucket base; precision `1` → 360 buckets over a full turn. */
const MINIMAL_ANGLE_BUCKETS = 360;
const DEFAULT_ANGLE_PRECISION: AnglePrecisions = 1e-1;
const DEFAULT_HASH_PRECISION: AnglePrecisions = 1;

export type AnglePrecisions = 1 | 1e-1 | 1e-2 | 1e-3;
export type AngleDomainKind = 'tau' | 'pi';

export type AngleOptions = {
  /** Ignore direction sense; return unsigned angle in `[0, π]`. */
  ignoreSens?: boolean;
  precision?: AnglePrecisions;
};

/** Shape required to interpret an angle hash (not stored in the hash). */
export type AngleHashShape = {
  domainKind: AngleDomainKind;
  precision: AnglePrecisions;
};

const DefaultAngleShape = {
  domainKind: 'tau',
  precision: DEFAULT_ANGLE_PRECISION,
} as const;

/** Angle in radians with an explicit domain (`τ` or `π`) and hash precision. */
export class Angle {
  static readonly type = 'Angle' as const;

  /** Type tag for dispatch (`switch (value.type)`). A prototype getter, so JSON and equality ignore it. */
  get type(): typeof Angle.type {
    return Angle.type;
  }
  static readonly tauDomain = Object.freeze(new Interval2(0, TAU));
  static readonly piDomain = Object.freeze(new Interval2(0, Math.PI));
  static readonly degreeScale = 180 / Math.PI;
  static readonly Pi = frozen(new Angle(Math.PI, 'tau', DEFAULT_ANGLE_PRECISION));
  static readonly Tau = frozen(new Angle(TAU, 'tau', DEFAULT_ANGLE_PRECISION));
  static readonly PiOver2 = frozen(new Angle(Math.PI / 2, 'tau', DEFAULT_ANGLE_PRECISION));
  static readonly ThreePiOver4 = frozen(new Angle((3 * Math.PI) / 4, 'tau', DEFAULT_ANGLE_PRECISION));
  static readonly ThreePiOver2 = frozen(new Angle((3 * Math.PI) / 2, 'tau', DEFAULT_ANGLE_PRECISION));

  constructor(
    private readonly value: Radians,
    private readonly domainKind: AngleDomainKind,
    private readonly precision: AnglePrecisions,
  ) {}

  getPrecision(): AnglePrecisions {
    return this.precision;
  }

  degrees(): number {
    return this.value * Angle.degreeScale;
  }

  getDomain(): Interval2 {
    return this.domainKind === 'pi' ? Angle.piDomain : Angle.tauDomain;
  }

  radians(): number {
    return this.value;
  }

  /**
   * Equal within the coarser of the two precisions, which are in degrees (as for hashing).
   * Two τ-domain angles are compared around the circle, so 359.99° equals 0°.
   */
  equals(other: Angle): boolean {
    const tolerance = Math.max(this.precision, other.precision) / Angle.degreeScale;
    const difference = Math.abs(this.value - other.value);
    const distance = this.isTauDomain() && other.isTauDomain() ? Math.min(difference, TAU - difference) : difference;
    return distance <= tolerance;
  }

  /** 90° or 270°. */
  isRightAngle(): boolean {
    return this.equals(Angle.PiOver2) || this.equals(Angle.ThreePiOver2);
  }

  isTauDomain(): boolean {
    return this.domainKind === 'tau';
  }

  isPiDomain(): boolean {
    return this.domainKind === 'pi';
  }

  /** Bucket hash of the value only; pass the same shape to `fromHash`. */
  hash(): number {
    return Angle.getAngleHash(this.value, this.precision, this.domainKind);
  }

  /** Restore an angle from a hash; pass the same shape to `hash`.
   * Default shape is `{ domainKind: 'tau', precision: DEFAULT_ANGLE_PRECISION (.1) }`.
   */
  static fromHash(hash: Integer, shape: AngleHashShape = DefaultAngleShape): Angle {
    const radians = Angle.dehashAngle(hash, shape);
    return new Angle(radians, shape.domainKind, shape.precision);
  }

  static fromRadians(radians: Radians, precision: AnglePrecisions = DEFAULT_ANGLE_PRECISION): Angle {
    return new Angle(Angle.wrapToTau(radians), 'tau', precision);
  }

  static fromDegrees(degrees: Coordinate, precision: AnglePrecisions = DEFAULT_ANGLE_PRECISION): Angle {
    return Angle.fromRadians(degrees / Angle.degreeScale, precision);
  }

  static fromTwoVectors(from: Vec2, to: Vec2, options: AngleOptions = {}): Angle {
    const { ignoreSens = false, precision = DEFAULT_ANGLE_PRECISION } = options;
    if (from.isZeroLength() || to.isZeroLength()) {
      throw new Error('Angle.fromTwoVectors cannot be used with a zero-length vector');
    }

    return Angle.fromDirected(Math.atan2(to.y, to.x) - Math.atan2(from.y, from.x), ignoreSens, precision);
  }

  /** Same as `fromTwoVectors(Vec2.baseX(), vector, options)`. */
  static vectorWithX(vector: Vec2, options: AngleOptions = DefaultAngleShape): Angle {
    const { ignoreSens = false, precision = DEFAULT_ANGLE_PRECISION } = options;
    if (vector.isZeroLength()) {
      throw new Error('Angle.vectorWithX cannot be used with a zero-length vector');
    }
    return Angle.fromDirected(Math.atan2(vector.y, vector.x), ignoreSens, precision);
  }

  private static fromDirected(radians: number, ignoreSens: boolean, precision: AnglePrecisions): Angle {
    const directed = Angle.wrapToTau(radians);
    return ignoreSens ? new Angle(Angle.foldToPi(directed), 'pi', precision) : new Angle(directed, 'tau', precision);
  }

  static fromPt3(a: Vec2, b: Vec2, c: Vec2, options: AngleOptions = {}): Angle {
    return Angle.fromTwoVectors(a.subtract(b), c.subtract(b), options);
  }

  static wrapToTau(radians: Radians): number {
    const r = radians % TAU;
    const wrapped = r < 0 ? r + TAU : r;
    // A tiny negative remainder rounds up to exactly TAU when shifted.
    return wrapped >= TAU ? 0 : wrapped;
  }

  static foldToPi(radians: Radians): number {
    return radians > Math.PI ? TAU - radians : radians;
  }

  static domainSpan(domain: AngleDomainKind): number {
    return domain === 'pi' ? Math.PI : TAU;
  }

  static getAngleBuckets(precision: AnglePrecisions, domain: AngleDomainKind = 'tau'): number {
    const fullCircle = MINIMAL_ANGLE_BUCKETS * Math.floor(1 / precision);
    return domain === 'pi' ? Math.floor(fullCircle / 2) : fullCircle;
  }

  static getBitWidthForPrecision(precision: AnglePrecisions, domain: AngleDomainKind = 'tau'): number {
    return Math.ceil(Math.log2(Angle.getAngleBuckets(precision, domain)));
  }

  /**
   * Quantize `radians` into a bucket. Half-bucket shift so values near common angles
   * share a bucket. Domain/precision are not encoded — pass the same shape to dehash.
   */
  static getAngleHash(
    radians: Radians,
    precision: AnglePrecisions = DEFAULT_HASH_PRECISION,
    domain: AngleDomainKind = 'tau',
  ): number {
    const buckets = Angle.getAngleBuckets(precision, domain);
    const span = Angle.domainSpan(domain);
    const wrapped = domain === 'tau' ? ((radians % span) + span) % span : Math.min(Math.max(radians, 0), span);
    const bucket = Math.floor((wrapped / span) * buckets + 0.5);
    // τ is periodic, so the half-bucket shift past the last bucket wraps to 0; π clamps.
    return domain === 'tau' ? bucket % buckets : Math.min(bucket, buckets - 1);
  }

  static dehashAngle(hash: Integer, shape: AngleHashShape): number {
    const buckets = Angle.getAngleBuckets(shape.precision, shape.domainKind);
    const span = Angle.domainSpan(shape.domainKind);
    return (hash / buckets) * span;
  }

  toJson(): AngleJson {
    return {
      type: Angle.type,
      value: this.value,
      domainKind: this.domainKind,
      precision: this.precision,
    };
  }
}

export type AngleJson = {
  type: typeof Angle.type;
  value: Radians;
  domainKind: AngleDomainKind;
  precision: AnglePrecisions;
};
