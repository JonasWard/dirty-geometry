/**
 * The hand-written half of the schema: decisions, not facts. Everything else in vec2.schema.json is
 * generated from the source. Ids are typed against the generated `OperationId`, so an entry for a
 * method that no longer exists is a compile error.
 */
import type { OperationId } from './ids';

type ClassName = OperationId extends `${infer Owner}.new` ? Owner : never;

export const policy = {
  /** Classes whose members are never recorded, with the reason. */
  excludeClasses: {
    CdtMesh: 'mutable triangulation scratch structure',
    CodecRegistry: 'mutable registry',
    Deserialise: 'JSON decoding; definitions store values through the codec registry instead',
  } satisfies Partial<Record<ClassName | 'CdtMesh' | 'CodecRegistry' | 'Deserialise', string>>,

  /** Member names never recorded on any class. */
  excludeMembers: {
    toJson: 'serialisation, not geometry',
    serialise: 'serialisation, not geometry',
  } as Record<string, string>,

  /** Individual operations never recorded. */
  excludeOperations: {} satisfies Partial<Record<OperationId, string>>,

  /**
   * Renamed operations: old id → current id. Definitions recorded before a rename keep replaying.
   * Add an entry whenever a recordable operation is renamed.
   */
  aliases: {
    // Loose operation functions moved onto static classes or into operations/helpers/.
    'operations/cdt/hull:convexHullLoop': 'operations/helpers/cdt/hull:convexHullLoop',
    'operations/cdt/mesh:emptyCdtStats': 'operations/helpers/cdt/mesh:emptyCdtStats',
    'operations/cdt/triangulate:triangulateConstrained': 'operations/helpers/cdt/triangulate:triangulateConstrained',
    'operations/constrained-delaunay:collectConstraintSources': 'ConstrainedDelaunay.collectSources',
    'operations/constrained-delaunay:constrainedDelaunay': 'ConstrainedDelaunay.triangulate',
    'operations/constrained-delaunay:constrainedDelaunayReport': 'ConstrainedDelaunay.report',
    'operations/constrained-delaunay:constraintEdge': 'operations/helpers/constraint-edge:constraintEdge',
    'operations/constrained-delaunay:constraintEdgeEndpoints':
      'operations/helpers/constraint-edge:constraintEdgeEndpoints',
    'operations/constrained-delaunay:triangulateSources': 'ConstrainedDelaunay.fromGeometries',
    'operations/douglas-peucker:douglasPeucker': 'DouglasPeucker.simplify',
    'operations/douglas-peucker:douglasPeuckerVertices': 'DouglasPeucker.simplifyVertices',
    'operations/douglas-peucker:resolveDouglasPeuckerTolerances':
      'operations/helpers/douglas-peucker-tolerances:resolveDouglasPeuckerTolerances',
    'operations/intersection/line2-like:intersectionLines': 'Intersection2.lines',
    'operations/intersection/segment-sweep:findSegmentCrossings': 'Intersection2.segmentCrossings',
    'operations/polygon-analysis/grid-from-world:buildGrid2FromWorldPolygons': 'RectilinearGrid2.fromPolygons',
    'operations/polygon-analysis/grid-from-world:buildGrid2FromWorldVertices': 'RectilinearGrid2.fromVertices',
    'operations/polygon-analysis/grid-polygon-path:axisDirection': 'operations/helpers/grid-polygon-path:axisDirection',
    'operations/polygon-analysis/grid-polygon-path:directionDelta':
      'operations/helpers/grid-polygon-path:directionDelta',
    'operations/polygon-analysis/grid-polygon-path:ensureAxisAlignedPolygonPath':
      'operations/helpers/grid-polygon-path:ensureAxisAlignedPolygonPath',
    'operations/polygon-analysis/grid-polygon-path:isAxisAlignedPolygonPath':
      'operations/helpers/grid-polygon-path:isAxisAlignedPolygonPath',
    'operations/polygon-analysis/rectangle-decomposition:decomposeOccupancyIntoRectangles':
      'RectilinearGrid2.decompose',
    'operations/polygon-analysis/rectilinear-detection:detectRectilinearGridFromPolygons': 'RectilinearGrid2.detect',
  } satisfies Record<string, OperationId>,
} as const;
