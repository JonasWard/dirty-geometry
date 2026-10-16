import { Circle2 } from '../../src/geometry/regions/circle2';
import {
  Contains2,
  type Container2 as ContainingGeometry2,
  type Geometry2 as ContainedGeometry2,
} from '../../src/operations/contains2';
import { Epsilon } from '../../src/core/epsilon';
import { InfiniteLine2 } from '../../src/geometry/primitives/infinite-line2';
import { Line2 } from '../../src/geometry/primitives/line2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Polyline2 } from '../../src/geometry/curves/polyline2';
import { Ray2 } from '../../src/geometry/primitives/ray2';
import { TriMesh2 } from '../../src/geometry/regions/tri-mesh2';
import { Vec2 } from '../../src/core/vec2';
import { annulusMesh, buildingYardMesh, hPlateMesh, lWingMesh, swissCheeseMesh } from '../tri-mesh2/meshes';

export type Contains2ScenarioSection =
  | 'point'
  | 'segment'
  | 'circle'
  | 'curve'
  | 'unbounded'
  | 'mesh'
  | 'mesh-complex'
  | 'mesh-guest';

export type Contains2Scenario = {
  name: string;
  section: Contains2ScenarioSection;
  container: ContainingGeometry2;
  guest: ContainedGeometry2;
  slack?: Epsilon;
};

const square = new Polygon2([new Vec2(0, 0), new Vec2(10, 0), new Vec2(10, 10), new Vec2(0, 10)]);

const largeFrame = new Polygon2([new Vec2(0, 0), new Vec2(12, 0), new Vec2(12, 12), new Vec2(0, 12)]);

const lShape = new Polygon2([
  new Vec2(0, 0),
  new Vec2(10, 0),
  new Vec2(10, 5),
  new Vec2(5, 5),
  new Vec2(5, 10),
  new Vec2(0, 10),
]);

const unitCircle = new Circle2(new Vec2(0, 0), 1);

const outerCircle = new Circle2(new Vec2(0, 0), 5);

const swissCircle = new Circle2(new Vec2(5, 4), 7);

const lWingCircle = new Circle2(new Vec2(4.5, 5.5), 8);

const xAxis = new InfiniteLine2(new Vec2(0, 0), new Vec2(1, 0));

const unitSquareMesh = new TriMesh2(
  [new Vec2(0, 0), new Vec2(2, 0), new Vec2(0, 2), new Vec2(2, 2)],
  [
    [0, 1, 2],
    [1, 3, 2],
  ],
);

const annulus = annulusMesh();

const swissCheese = swissCheeseMesh();

const lWing = lWingMesh();

const buildingYard = buildingYardMesh();

const hPlate = hPlateMesh();

const yardTriangle = new TriMesh2([new Vec2(3, 5), new Vec2(4.5, 5), new Vec2(3.75, 6)], [[0, 1, 2]]);

const cornerTriangle = new TriMesh2([new Vec2(8, 0.5), new Vec2(9.5, 0.5), new Vec2(9, 1.5)], [[0, 1, 2]]);

function shiftMesh(mesh: TriMesh2, dx: number, dy: number): TriMesh2 {
  return new TriMesh2(
    mesh.vertices.map((vertex) => new Vec2(vertex.x + dx, vertex.y + dy)),
    mesh.triangles,
  );
}

const annulusInHalfPlane = shiftMesh(annulus, 1, -4);

const swissInHalfPlane = shiftMesh(swissCheese, 1, -9);

const annulusEscapingCircle = shiftMesh(annulus, 3, 3);

export const contains2PointScenarios: Contains2Scenario[] = [
  {
    name: 'Point in circle',
    section: 'point',
    container: unitCircle,
    guest: new Vec2(0, 0),
  },
  {
    name: 'Point on circle',
    section: 'point',
    container: unitCircle,
    guest: new Vec2(1, 0),
    slack: Epsilon.preferIn,
  },
  {
    name: 'Point outside circle',
    section: 'point',
    container: unitCircle,
    guest: new Vec2(2, 0),
  },
  {
    name: 'Point in square',
    section: 'point',
    container: square,
    guest: new Vec2(5, 5),
  },
  {
    name: 'Point in half-plane',
    section: 'point',
    container: xAxis,
    guest: new Vec2(3, -2),
  },
  {
    name: 'Point in tri-mesh',
    section: 'point',
    container: unitSquareMesh,
    guest: new Vec2(0.5, 0.5),
  },
];

export const contains2SegmentScenarios: Contains2Scenario[] = [
  {
    name: 'Segment inside',
    section: 'segment',
    container: square,
    guest: new Line2(new Vec2(1, 1), new Vec2(8, 8)),
  },
  {
    name: 'Segment escapes',
    section: 'segment',
    container: square,
    guest: new Line2(new Vec2(1, 1), new Vec2(20, 1)),
  },
  {
    name: 'Edge on boundary',
    section: 'segment',
    container: square,
    guest: new Line2(new Vec2(0, 0), new Vec2(10, 0)),
    slack: Epsilon.preferIn,
  },
  {
    name: 'Edge strict interior',
    section: 'segment',
    container: square,
    guest: new Line2(new Vec2(0, 0), new Vec2(10, 0)),
    slack: Epsilon.preferOut,
  },
  {
    name: 'L-notch shortcut',
    section: 'segment',
    container: lShape,
    guest: new Line2(new Vec2(4, 9), new Vec2(9, 4)),
  },
];

export const contains2CircleScenarios: Contains2Scenario[] = [
  {
    name: 'Circle in circle',
    section: 'circle',
    container: outerCircle,
    guest: new Circle2(new Vec2(1, 0), 2),
  },
  {
    name: 'Circle touching',
    section: 'circle',
    container: outerCircle,
    guest: new Circle2(new Vec2(3, 0), 2),
    slack: Epsilon.preferIn,
  },
  {
    name: 'Circle in square',
    section: 'circle',
    container: square,
    guest: new Circle2(new Vec2(5, 5), 2),
  },
  {
    name: 'Circle in half-plane',
    section: 'circle',
    container: xAxis,
    guest: new Circle2(new Vec2(0, -2), 1),
  },
];

export const contains2CurveScenarios: Contains2Scenario[] = [
  {
    name: 'Polyline inside',
    section: 'curve',
    container: square,
    guest: new Polyline2([new Vec2(1, 1), new Vec2(5, 2), new Vec2(8, 8)]),
  },
  {
    name: 'Polyline escapes',
    section: 'curve',
    container: square,
    guest: new Polyline2([new Vec2(1, 1), new Vec2(5, 5), new Vec2(20, 5)]),
  },
  {
    name: 'Polygon inside',
    section: 'curve',
    container: square,
    guest: new Polygon2([new Vec2(2, 2), new Vec2(4, 2), new Vec2(4, 4), new Vec2(2, 4)]),
  },
];

export const contains2UnboundedScenarios: Contains2Scenario[] = [
  {
    name: 'Ray in half-plane',
    section: 'unbounded',
    container: xAxis,
    guest: new Ray2(new Vec2(0, -1), new Vec2(0, -1)),
  },
  {
    name: 'Ray leaves half-plane',
    section: 'unbounded',
    container: xAxis,
    guest: new Ray2(new Vec2(0, -1), new Vec2(0, 1)),
  },
  {
    name: 'Parallel line inside',
    section: 'unbounded',
    container: xAxis,
    guest: new InfiniteLine2(new Vec2(0, -2), new Vec2(1, 0)),
  },
  {
    name: 'Ray in bounded region',
    section: 'unbounded',
    container: square,
    guest: new Ray2(new Vec2(5, 5), new Vec2(1, 0)),
  },
];

export const contains2MeshScenarios: Contains2Scenario[] = [
  {
    name: 'Mesh inside square',
    section: 'mesh',
    container: square,
    guest: new TriMesh2([new Vec2(1, 1), new Vec2(3, 1), new Vec2(2, 3)], [[0, 1, 2]]),
  },
  {
    name: 'Mesh crosses boundary',
    section: 'mesh',
    container: square,
    guest: new TriMesh2([new Vec2(1, 1), new Vec2(11, 1), new Vec2(6, 6)], [[0, 1, 2]]),
  },
  {
    name: 'Annulus in square',
    section: 'mesh',
    container: square,
    guest: annulus,
  },
  {
    name: 'Triangle in building yard',
    section: 'mesh',
    container: buildingYard,
    guest: yardTriangle,
  },
];

export const contains2ComplexMeshScenarios: Contains2Scenario[] = [
  {
    name: 'Point in annulus ring',
    section: 'mesh-complex',
    container: annulus,
    guest: new Vec2(0.5, 0.5),
  },
  {
    name: 'Point in annulus hole',
    section: 'mesh-complex',
    container: annulus,
    guest: new Vec2(1.5, 1.5),
  },
  {
    name: 'Point in swiss hole',
    section: 'mesh-complex',
    container: swissCheese,
    guest: new Vec2(1.75, 1.75),
  },
  {
    name: 'Point in L-wing leg',
    section: 'mesh-complex',
    container: lWing,
    guest: new Vec2(2, 8),
  },
  {
    name: 'Circle in annulus ring',
    section: 'mesh-complex',
    container: annulus,
    guest: new Circle2(new Vec2(0.5, 0.5), 0.2),
  },
  {
    name: 'Circle in annulus hole',
    section: 'mesh-complex',
    container: annulus,
    guest: new Circle2(new Vec2(1.5, 1.5), 0.2),
  },
  {
    name: 'Circle in H-plate leg',
    section: 'mesh-complex',
    container: hPlate,
    guest: new Circle2(new Vec2(9, 1), 0.3),
  },
  {
    name: 'Circle in H-plate hole',
    section: 'mesh-complex',
    container: hPlate,
    guest: new Circle2(new Vec2(6, 6), 0.3),
  },
  {
    name: 'Mesh spans swiss hole',
    section: 'mesh-complex',
    container: swissCheese,
    guest: new TriMesh2([new Vec2(1.4, 1.4), new Vec2(2.6, 1.4), new Vec2(2, 2.6)], [[0, 1, 2]]),
  },
  {
    name: 'Triangle in swiss cheese',
    section: 'mesh-complex',
    container: swissCheese,
    guest: cornerTriangle,
  },
  {
    name: 'Polyline in annulus',
    section: 'mesh-complex',
    container: annulus,
    guest: new Polyline2([new Vec2(0.4, 0.4), new Vec2(2.5, 0.5), new Vec2(2.5, 2.5)]),
  },
  {
    name: 'Inner square in annulus',
    section: 'mesh-complex',
    container: annulus,
    guest: new Polygon2([new Vec2(2.2, 0.4), new Vec2(2.8, 0.4), new Vec2(2.8, 1), new Vec2(2.2, 1)]),
  },
];

export const contains2ComplexMeshGuestScenarios: Contains2Scenario[] = [
  {
    name: 'Annulus in circle',
    section: 'mesh-guest',
    container: outerCircle,
    guest: annulus,
  },
  {
    name: 'Swiss in circle',
    section: 'mesh-guest',
    container: swissCircle,
    guest: swissCheese,
  },
  {
    name: 'L-wing in circle',
    section: 'mesh-guest',
    container: lWingCircle,
    guest: lWing,
  },
  {
    name: 'Mesh escapes circle',
    section: 'mesh-guest',
    container: outerCircle,
    guest: annulusEscapingCircle,
  },
  {
    name: 'Swiss in square',
    section: 'mesh-guest',
    container: square,
    guest: swissCheese,
  },
  {
    name: 'L-wing in large frame',
    section: 'mesh-guest',
    container: largeFrame,
    guest: lWing,
  },
  {
    name: 'H-plate in large frame',
    section: 'mesh-guest',
    container: largeFrame,
    guest: hPlate,
  },
  {
    name: 'Annulus in L-notch',
    section: 'mesh-guest',
    container: lShape,
    guest: annulus,
  },
  {
    name: 'Mesh escapes square',
    section: 'mesh-guest',
    container: new Polygon2([new Vec2(0, 0), new Vec2(2, 0), new Vec2(2, 2), new Vec2(0, 2)]),
    guest: annulus,
  },
  {
    name: 'Annulus in half-plane',
    section: 'mesh-guest',
    container: xAxis,
    guest: annulusInHalfPlane,
  },
  {
    name: 'Swiss in half-plane',
    section: 'mesh-guest',
    container: xAxis,
    guest: swissInHalfPlane,
  },
  {
    name: 'Mesh crosses half-plane',
    section: 'mesh-guest',
    container: xAxis,
    guest: annulus,
  },
];

export const contains2Scenarios: Contains2Scenario[] = [
  ...contains2PointScenarios,
  ...contains2SegmentScenarios,
  ...contains2CircleScenarios,
  ...contains2CurveScenarios,
  ...contains2UnboundedScenarios,
  ...contains2MeshScenarios,
  ...contains2ComplexMeshScenarios,
  ...contains2ComplexMeshGuestScenarios,
];

export function evaluateContainsScenario(scenario: Contains2Scenario): boolean {
  return Contains2.contains(scenario.container, scenario.guest, scenario.slack ?? Epsilon.preferIn);
}

export function containerKind(container: ContainingGeometry2): string {
  return container.type;
}

export function guestKind(guest: ContainedGeometry2): string {
  return guest.type;
}
