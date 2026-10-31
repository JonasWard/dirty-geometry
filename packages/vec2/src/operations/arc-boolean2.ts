import type { Length } from '../core/numbers';
import type { InfiniteLine2 } from '../geometry/primitives/infinite-line2';
import { ArcPolygon2 } from '../geometry/regions/arc-polygon2';
import type { Circle2 } from '../geometry/regions/circle2';
import type { Polygon2 } from '../geometry/regions/polygon2';
import { Boolean2, type Boolean2Options, type Boolean2Result } from './boolean2';

/** A filled shape whose boundary may be curved. */
export type ArcBoolean2Shape = Polygon2 | ArcPolygon2 | Circle2;
export type ArcBoolean2Clip = ArcBoolean2Shape | InfiniteLine2;

export type ArcBoolean2Options = Boolean2Options & {
  /** Largest distance between an arc and the chords that replace it. */
  chordTolerance: Length;
};

/**
 * Approximate boolean operations on shapes with arcs and circles. Each arc is replaced by chords within
 * `chordTolerance` (winding kept, so clockwise shapes stay holes) and the result comes from
 * {@link Boolean2}: polygons, with no arcs. Options such as `fillRule` and `mesh` pass through.
 */
export class ArcBoolean2 {
  private constructor() {}

  static union(shapes: readonly ArcBoolean2Shape[], options: ArcBoolean2Options): Boolean2Result {
    return Boolean2.union(flattenAll(shapes, options.chordTolerance), options);
  }

  static intersect(
    subject: readonly ArcBoolean2Shape[],
    clips: readonly ArcBoolean2Clip[],
    options: ArcBoolean2Options,
  ): Boolean2Result {
    return Boolean2.intersect(flattenAll(subject, options.chordTolerance), flattenClips(clips, options), options);
  }

  static subtract(
    subject: readonly ArcBoolean2Shape[],
    clips: readonly ArcBoolean2Clip[],
    options: ArcBoolean2Options,
  ): Boolean2Result {
    return Boolean2.subtract(flattenAll(subject, options.chordTolerance), flattenClips(clips, options), options);
  }

  /** A shape as a polygon whose chords stay within `chordTolerance` of its boundary. */
  static flatten(shape: ArcBoolean2Shape, chordTolerance: Length): Polygon2 {
    switch (shape.type) {
      case 'Polygon2':
        return shape;
      case 'ArcPolygon2':
        return shape.toPolygon(chordTolerance);
      case 'Circle2':
        return ArcPolygon2.fromCircle2(shape).toPolygon(chordTolerance);
    }
  }
}

function flattenAll(shapes: readonly ArcBoolean2Shape[], chordTolerance: Length): Polygon2[] {
  return shapes.map((shape) => ArcBoolean2.flatten(shape, chordTolerance));
}

function flattenClips(clips: readonly ArcBoolean2Clip[], options: ArcBoolean2Options): (Polygon2 | InfiniteLine2)[] {
  return clips.map((clip) =>
    clip.type === 'InfiniteLine2' ? clip : ArcBoolean2.flatten(clip, options.chordTolerance),
  );
}
