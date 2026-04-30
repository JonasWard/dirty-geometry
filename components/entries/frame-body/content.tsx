import AxesGraphic from "@/components/entries/frame-body/axes-graphic.svg";
import OrientationVsFrameGraphic from "@/components/entries/frame-body/orientation-vs-frame-graphic.svg";
import MatrixGraphic from "@/components/entries/frame-body/matrix-graphic.svg";
import ThreePointsGraphic from "@/components/entries/frame-body/three-points-graphic.svg";
import type { StaticImageData } from "next/image";

const toImageSrc = (graphic: string | StaticImageData) =>
  typeof graphic === "string" ? graphic : graphic.src;

const methods = [
  {
    title: '1) Origin + two orthonormal directions',
    idea: 'Pick an origin O, then choose x and y as unit vectors with x dot y = 0. The third axis is z = x x y.',
    unique: 'Unique when x and y are non-zero, orthogonal, normalized, and the handedness convention is fixed.'
  },
  {
    title: '2) Origin + three points (O, A, B)',
    idea: 'Use OA as the first axis. Project OB to remove its component along OA to get the second axis. Cross-product gives the third.',
    unique: 'Unique when A != O, B is not collinear with OA, and you enforce right-handed orientation.'
  },
  {
    title: '3) Translation + rotation matrix R',
    idea: 'A rigid transform [R | t] already encodes a frame: columns of R are axes, t is the origin.',
    unique: 'Unique when R is orthonormal (R^T R = I, det(R)=+1).'
  },
  {
    title: '4) Translation + quaternion q',
    idea: 'Convert q to a rotation matrix and pair it with origin t.',
    unique: 'Unique up to sign because q and -q represent the same rotation.'
  },
  {
    title: '5) Plane normal + in-plane direction + point',
    idea: 'Given point O, normal n, and tangent u in the plane, normalize n and u then set v = n x u.',
    unique: 'Unique when n and u are non-zero and not parallel.'
  }
];

export default function FrameBody() {
  return (
    <div className="max-w-5xl space-y-16">
      <section className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.45em] uppercase mb-6 text-[#c49a4a]">3D Geometry Notes</p>
        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">
          Ways to uniquely define a frame in 3D space
        </h1>
        <p className="text-lg text-[#555] leading-relaxed">
          A frame is an origin and three orthonormal axes. Different data can define the same frame, as long as you
          remove ambiguities such as scale, collinearity, and handedness.
        </p>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <article className="border border-[#e4ddd3] bg-[#f8f5f0]">
          <img
            src={toImageSrc(AxesGraphic)}
            alt="3D frame axes"
            className="w-full h-auto"
          />
          <div className="p-6">
            <h2 className="text-xl font-bold mb-3">Canonical frame components</h2>
            <p className="text-[#555] leading-relaxed">
              Start from O and choose unit vectors x and y with x dot y = 0. Then z = x x y. This is the most direct
              definition.
            </p>
          </div>
        </article>

        <article className="border border-[#e4ddd3] bg-[#f8f5f0]">
          <img
            src={toImageSrc(ThreePointsGraphic)}
            alt="Frame from three points"
            className="w-full h-auto"
          />
          <div className="p-6">
            <h2 className="text-xl font-bold mb-3">Build from points and constraints</h2>
            <p className="text-[#555] leading-relaxed">
              O, A, and B define OA and a plane direction OB. Orthogonalize OB against OA to create a stable second
              axis.
            </p>
          </div>
        </article>
      </section>

      <section className="border border-[#e4ddd3] bg-[#f8f5f0]">
        <img
          src={toImageSrc(MatrixGraphic)}
          alt="Frame from rigid transform"
          className="w-full h-auto"
        />
        <div className="p-6">
          <h2 className="text-xl font-bold mb-3">Rigid transform representation</h2>
          <p className="text-[#555] leading-relaxed">
            In graphics and robotics, frames are often carried as transforms. The matrix columns are axis directions and
            translation is the origin.
          </p>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold">Quaternion vs Euler angles vs frame in space</h2>
        <p className="text-[#555] leading-relaxed max-w-4xl">
          Quaternion and Euler angles are both ways to encode <span className="font-semibold">orientation</span> only. A
          frame in space is larger: it includes orientation <span className="font-semibold">and</span> position. In
          other words, orientation answers &quot;which way is it pointing?&quot;, while a frame answers both &quot;which
          way?&quot; and &quot;where?&quot;.
        </p>

        <div className="border border-[#e4ddd3] bg-[#f8f5f0]">
          <img
            src={toImageSrc(OrientationVsFrameGraphic)}
            alt="Orientation versus frame comparison"
            className="w-full h-auto"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="border border-[#e4ddd3] bg-white/60 p-5">
            <h3 className="font-bold mb-2">Euler angles</h3>
            <p className="text-sm text-[#555] mb-2">Three sequential rotations (for example yaw, pitch, roll).</p>
            <p className="text-sm text-[#666]">
              Intuitive to read, but depends on axis order and can suffer gimbal lock.
            </p>
          </article>

          <article className="border border-[#e4ddd3] bg-white/60 p-5">
            <h3 className="font-bold mb-2">Quaternion</h3>
            <p className="text-sm text-[#555] mb-2">Compact 4D representation of rotation.</p>
            <p className="text-sm text-[#666]">
              Stable for interpolation and composition; q and -q encode the same orientation.
            </p>
          </article>

          <article className="border border-[#e4ddd3] bg-white/60 p-5">
            <h3 className="font-bold mb-2">Frame (pose)</h3>
            <p className="text-sm text-[#555] mb-2">Position t plus orientation (Euler, quaternion, or matrix).</p>
            <p className="text-sm text-[#666]">This is what uniquely places an object in world coordinates.</p>
          </article>
        </div>

        <div className="border border-[#e4ddd3] bg-white/70 p-6">
          <h3 className="font-bold mb-3">Practical rule of thumb</h3>
          <p className="text-[#555] leading-relaxed">
            If your data has only Euler angles or only a quaternion, you still need an origin (translation) to define a
            full frame. If you have both translation and orientation, you have a complete 3D pose.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6">Equivalently valid definitions</h2>
        <div className="space-y-4">
          {methods.map((method) => (
            <article key={method.title} className="border border-[#e4ddd3] bg-white/50 p-6">
              <h3 className="text-lg font-bold mb-2">{method.title}</h3>
              <p className="text-[#444] mb-2">{method.idea}</p>
              <p className="text-sm text-[#666]">
                <span className="font-semibold">Uniqueness condition:</span> {method.unique}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
