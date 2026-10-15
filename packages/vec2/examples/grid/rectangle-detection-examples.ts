import { Vec2 } from '../../src/core/vec2';
import { Polygon2 } from '../../src/geometry/regions/polygon2';
import { Deserialise } from '../../src/io/deserialise';

const JSON_POLYGONS = [
  [
    {
      type: 'Polygon2',
      vertices: [
        {
          type: 'Vec2',
          x: 5.201000213623047,
          y: -0.41999998688697815,
        },
        {
          type: 'Vec2',
          x: 13.100000381469727,
          y: -0.4199999868869777,
        },
        {
          type: 'Vec2',
          x: 13.100000381469727,
          y: -3.0299999713897705,
        },
        {
          type: 'Vec2',
          x: 13.100000381469727,
          y: -6.523999929428101,
        },
        {
          type: 'Vec2',
          x: 13.100000381469727,
          y: -10.273999691009521,
        },
        {
          type: 'Vec2',
          x: 13.100000381469727,
          y: -12.099999904632568,
        },
        {
          type: 'Vec2',
          x: 13.100000381469727,
          y: -16.459999084472656,
        },
        {
          type: 'Vec2',
          x: 5.809999942779541,
          y: -16.459999084472656,
        },
        {
          type: 'Vec2',
          x: 5.809999942779541,
          y: -12.099999904632568,
        },
        {
          type: 'Vec2',
          x: 5.809999942779541,
          y: -8.394999980926514,
        },
        {
          type: 'Vec2',
          x: 5.809999942779541,
          y: -6.710000038146973,
        },
        {
          type: 'Vec2',
          x: 5.201000213623047,
          y: -6.710000038146973,
        },
        {
          type: 'Vec2',
          x: 5.201000213623047,
          y: -1.9039999842643738,
        },
      ],
    },
  ],
  [
    {
      type: 'Polygon2',
      vertices: [
        {
          type: 'Vec2',
          x: 5.810999870300293,
          y: -6.789000034332275,
        },
        {
          type: 'Vec2',
          x: 2.5260000228881836,
          y: -6.789000034332275,
        },
        {
          type: 'Vec2',
          x: -2.0190000534057613,
          y: -6.789000034332275,
        },
        {
          type: 'Vec2',
          x: -2.0190000534057617,
          y: -3.0160000324249268,
        },
        {
          type: 'Vec2',
          x: -2.0190000534057617,
          y: -0.3409999907016754,
        },
        {
          type: 'Vec2',
          x: 5.1559998989105225,
          y: -0.3409999907016754,
        },
        {
          type: 'Vec2',
          x: 10.573999881744385,
          y: -0.3409999907016754,
        },
        {
          type: 'Vec2',
          x: 13.178999900817871,
          y: -0.3409999907016754,
        },
        {
          type: 'Vec2',
          x: 13.178999900817871,
          y: -1.9749999642372131,
        },
        {
          type: 'Vec2',
          x: 13.178999900817871,
          y: -5.114000082015991,
        },
        {
          type: 'Vec2',
          x: 13.178999900817871,
          y: -6.884000062942505,
        },
        {
          type: 'Vec2',
          x: 13.178999900817871,
          y: -16.538999557495117,
        },
        {
          type: 'Vec2',
          x: 5.810999870300293,
          y: -16.538999557495117,
        },
        {
          type: 'Vec2',
          x: 5.810999870300293,
          y: -13.118000030517578,
        },
        {
          type: 'Vec2',
          x: 5.810999870300293,
          y: -12.6419997215271,
        },
      ],
    },
    {
      type: 'Polygon2',
      vertices: [
        {
          type: 'Vec2',
          x: 6.86299991607666,
          y: 11.376999855041504,
        },
        {
          type: 'Vec2',
          x: 15.357000350952148,
          y: 11.376999855041504,
        },
        {
          type: 'Vec2',
          x: 15.357000350952148,
          y: 4.552999973297119,
        },
        {
          type: 'Vec2',
          x: 6.86299991607666,
          y: 4.552999973297119,
        },
      ],
    },
  ],
  [],
];

const otherPolygons = JSON_POLYGONS.map((plgs) =>
  plgs.map((json) => Deserialise.deserialise(JSON.stringify(json)) as Polygon2),
);

/** Building footprint from wall-graph style world coordinates (rectilinear, negative y down). */
export const exampleBuildingFootprintVertices = [
  new Vec2(0.40099999308586076, -0.4009999930858612),
  new Vec2(3.1590000000000003, -0.4009999930858612),
  new Vec2(6.425003996666667, -0.4009999930858612),
  new Vec2(7.667001026666667, -0.4009999930858612),
  new Vec2(11.071000099182129, -0.4009999930858612),
  new Vec2(14.043999671936035, -0.4009999930858612),
  new Vec2(14.043999671936035, -4.610999822616577),
  new Vec2(14.043999671936035, -8.815999984741211),
  new Vec2(9.267998615333333, -8.815999984741211),
  new Vec2(6.354000091552734, -8.815999984741211),
  new Vec2(6.354000091552735, -10.699000358581543),
  new Vec2(0.4009999930858612, -10.699000358581543),
  new Vec2(0.4009999930858612, -6.4440034),
  new Vec2(0.4009999930858612, -3.5749994666666667),
] as const;

export const exampleBuildingFootprintPolygon = new Polygon2([...exampleBuildingFootprintVertices]);

/** Simple rectilinear notch for smaller demo cells. */
export const exampleNotchPolygon = new Polygon2([
  new Vec2(0, 0),
  new Vec2(6, 0),
  new Vec2(6, 2),
  new Vec2(3, 2),
  new Vec2(3, 5),
  new Vec2(0, 5),
]);

export const rectangleDetectionExamples = [
  { name: 'Building footprint', polygons: [exampleBuildingFootprintPolygon] },
  { name: 'Notch polygon', polygons: [exampleNotchPolygon] },
  ...otherPolygons
    .filter((polygons) => polygons.length > 0)
    .map((polygons, i) => ({ name: `Hessdorf 169 ${i}`, polygons })),
] as const;
