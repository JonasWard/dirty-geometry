const methods = [
  {
    title: "1) Origin + two orthonormal directions",
    idea: "Pick an origin O, then choose x and y as unit vectors with x dot y = 0. The third axis is z = x x y.",
    unique: "Unique when x and y are non-zero, orthogonal, normalized, and the handedness convention is fixed.",
  },
  {
    title: "2) Origin + three points (O, A, B)",
    idea: "Use OA as the first axis. Project OB to remove its component along OA to get the second axis. Cross-product gives the third.",
    unique: "Unique when A != O, B is not collinear with OA, and you enforce right-handed orientation.",
  },
  {
    title: "3) Translation + rotation matrix R",
    idea: "A rigid transform [R | t] already encodes a frame: columns of R are axes, t is the origin.",
    unique: "Unique when R is orthonormal (R^T R = I, det(R)=+1).",
  },
  {
    title: "4) Translation + quaternion q",
    idea: "Convert q to a rotation matrix and pair it with origin t.",
    unique: "Unique up to sign because q and -q represent the same rotation.",
  },
  {
    title: "5) Plane normal + in-plane direction + point",
    idea: "Given point O, normal n, and tangent u in the plane, normalize n and u then set v = n x u.",
    unique: "Unique when n and u are non-zero and not parallel.",
  },
];

function AxesGraphic() {
  return (
    <svg
      viewBox="0 0 360 220"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
      role="img"
      aria-label="3D frame axes"
    >
      <rect x="0" y="0" width="360" height="220" fill="#f1ebdf" />
      <line x1="80" y1="170" x2="300" y2="170" stroke="#d5c7ae" strokeWidth="1" />
      <line x1="80" y1="170" x2="80" y2="30" stroke="#d5c7ae" strokeWidth="1" />

      <circle cx="120" cy="140" r="5" fill="#18181b" />
      <text x="108" y="158" fontSize="12" fill="#18181b">
        O
      </text>

      <line x1="120" y1="140" x2="230" y2="125" stroke="#d27d2f" strokeWidth="4" />
      <polygon points="230,125 220,119 222,129" fill="#d27d2f" />
      <text x="238" y="124" fontSize="12" fill="#d27d2f">
        x
      </text>

      <line x1="120" y1="140" x2="90" y2="60" stroke="#4a7f6f" strokeWidth="4" />
      <polygon points="90,60 86,71 96,67" fill="#4a7f6f" />
      <text x="72" y="58" fontSize="12" fill="#4a7f6f">
        y
      </text>

      <line x1="120" y1="140" x2="165" y2="75" stroke="#587ca0" strokeWidth="4" />
      <polygon points="165,75 155,79 163,86" fill="#587ca0" />
      <text x="172" y="73" fontSize="12" fill="#587ca0">
        z
      </text>
    </svg>
  );
}

function ThreePointsGraphic() {
  return (
    <svg
      viewBox="0 0 360 220"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
      role="img"
      aria-label="Frame from three points"
    >
      <rect x="0" y="0" width="360" height="220" fill="#eef1e9" />

      <circle cx="90" cy="150" r="5" fill="#18181b" />
      <text x="76" y="168" fontSize="12" fill="#18181b">
        O
      </text>

      <circle cx="250" cy="140" r="5" fill="#18181b" />
      <text x="257" y="144" fontSize="12" fill="#18181b">
        A
      </text>

      <circle cx="160" cy="70" r="5" fill="#18181b" />
      <text x="167" y="74" fontSize="12" fill="#18181b">
        B
      </text>

      <line x1="90" y1="150" x2="250" y2="140" stroke="#d27d2f" strokeWidth="4" />
      <line x1="90" y1="150" x2="160" y2="70" stroke="#4a7f6f" strokeWidth="3" strokeDasharray="6 5" />
      <line x1="90" y1="150" x2="120" y2="55" stroke="#587ca0" strokeWidth="3" />

      <text x="176" y="132" fontSize="12" fill="#d27d2f">
        OA
      </text>
      <text x="136" y="100" fontSize="12" fill="#4a7f6f">
        OB
      </text>
      <text x="124" y="48" fontSize="12" fill="#587ca0">
        OB_perp
      </text>
    </svg>
  );
}

function MatrixGraphic() {
  return (
    <svg
      viewBox="0 0 360 220"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
      role="img"
      aria-label="Frame from rigid transform"
    >
      <rect x="0" y="0" width="360" height="220" fill="#ebeef5" />
      <text x="32" y="70" fontSize="24" fill="#18181b">
        [ R | t ]
      </text>
      <text x="36" y="102" fontSize="12" fill="#555">
        R = [x y z]
      </text>
      <text x="36" y="122" fontSize="12" fill="#555">
        t = origin
      </text>

      <line x1="170" y1="160" x2="300" y2="160" stroke="#d27d2f" strokeWidth="4" />
      <line x1="170" y1="160" x2="140" y2="80" stroke="#4a7f6f" strokeWidth="4" />
      <line x1="170" y1="160" x2="220" y2="90" stroke="#587ca0" strokeWidth="4" />
      <circle cx="170" cy="160" r="5" fill="#18181b" />
      <text x="176" y="176" fontSize="12" fill="#18181b">
        t
      </text>
    </svg>
  );
}

function OrientationVsFrameGraphic() {
  return (
    <svg
      viewBox="0 0 760 240"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
      role="img"
      aria-label="Orientation versus frame comparison"
    >
      <rect x="0" y="0" width="760" height="240" fill="#f4efe5" />

      <rect x="20" y="20" width="340" height="200" fill="#ffffff" stroke="#e4ddd3" />
      <text x="40" y="52" fontSize="16" fontWeight="700" fill="#18181b">
        Orientation only
      </text>
      <text x="40" y="74" fontSize="13" fill="#555">
        (Quaternion / Euler / Rotation matrix)
      </text>
      <line x1="120" y1="165" x2="235" y2="165" stroke="#d27d2f" strokeWidth="4" />
      <line x1="120" y1="165" x2="94" y2="95" stroke="#4a7f6f" strokeWidth="4" />
      <line x1="120" y1="165" x2="165" y2="102" stroke="#587ca0" strokeWidth="4" />
      <circle cx="120" cy="165" r="5" fill="#18181b" />
      <text x="132" y="184" fontSize="12" fill="#555">
        orientation, no position
      </text>

      <rect x="400" y="20" width="340" height="200" fill="#ffffff" stroke="#e4ddd3" />
      <text x="420" y="52" fontSize="16" fontWeight="700" fill="#18181b">
        Full frame in space
      </text>
      <text x="420" y="74" fontSize="13" fill="#555">
        (Position + orientation)
      </text>
      <line x1="520" y1="165" x2="635" y2="165" stroke="#d27d2f" strokeWidth="4" />
      <line x1="520" y1="165" x2="494" y2="95" stroke="#4a7f6f" strokeWidth="4" />
      <line x1="520" y1="165" x2="565" y2="102" stroke="#587ca0" strokeWidth="4" />
      <circle cx="520" cy="165" r="5" fill="#18181b" />
      <text x="534" y="184" fontSize="12" fill="#555">
        t + rotation
      </text>

      <line x1="360" y1="120" x2="400" y2="120" stroke="#888" strokeWidth="2" />
      <text x="367" y="112" fontSize="12" fill="#555">
        + t
      </text>
    </svg>
  );
}

export default function FrameBody() {
  return (
    <div className="max-w-5xl space-y-16">
      <section className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.45em] uppercase mb-6 text-[#c49a4a]">
          3D Geometry Notes
        </p>
        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">
          Ways to uniquely define a frame in 3D space
        </h1>
        <p className="text-lg text-[#555] leading-relaxed">
          A frame is an origin and three orthonormal axes. Different data can
          define the same frame, as long as you remove ambiguities such as
          scale, collinearity, and handedness.
        </p>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <article className="border border-[#e4ddd3] bg-[#f8f5f0]">
          <AxesGraphic />
          <div className="p-6">
            <h2 className="text-xl font-bold mb-3">Canonical frame components</h2>
            <p className="text-[#555] leading-relaxed">
              Start from O and choose unit vectors x and y with x dot y = 0.
              Then z = x x y. This is the most direct definition.
            </p>
          </div>
        </article>

        <article className="border border-[#e4ddd3] bg-[#f8f5f0]">
          <ThreePointsGraphic />
          <div className="p-6">
            <h2 className="text-xl font-bold mb-3">
              Build from points and constraints
            </h2>
            <p className="text-[#555] leading-relaxed">
              O, A, and B define OA and a plane direction OB. Orthogonalize OB
              against OA to create a stable second axis.
            </p>
          </div>
        </article>
      </section>

      <section className="border border-[#e4ddd3] bg-[#f8f5f0]">
        <MatrixGraphic />
        <div className="p-6">
          <h2 className="text-xl font-bold mb-3">Rigid transform representation</h2>
          <p className="text-[#555] leading-relaxed">
            In graphics and robotics, frames are often carried as transforms. The
            matrix columns are axis directions and translation is the origin.
          </p>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold">
          Quaternion vs Euler angles vs frame in space
        </h2>
        <p className="text-[#555] leading-relaxed max-w-4xl">
          Quaternion and Euler angles are both ways to encode{" "}
          <span className="font-semibold">orientation</span> only. A frame in space
          is larger: it includes orientation{" "}
          <span className="font-semibold">and</span> position. In other words,
          orientation answers &quot;which way is it pointing?&quot;, while a
          frame answers both &quot;which way?&quot; and &quot;where?&quot;.
        </p>

        <div className="border border-[#e4ddd3] bg-[#f8f5f0]">
          <OrientationVsFrameGraphic />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="border border-[#e4ddd3] bg-white/60 p-5">
            <h3 className="font-bold mb-2">Euler angles</h3>
            <p className="text-sm text-[#555] mb-2">
              Three sequential rotations (for example yaw, pitch, roll).
            </p>
            <p className="text-sm text-[#666]">
              Intuitive to read, but depends on axis order and can suffer gimbal
              lock.
            </p>
          </article>

          <article className="border border-[#e4ddd3] bg-white/60 p-5">
            <h3 className="font-bold mb-2">Quaternion</h3>
            <p className="text-sm text-[#555] mb-2">
              Compact 4D representation of rotation.
            </p>
            <p className="text-sm text-[#666]">
              Stable for interpolation and composition; q and -q encode the same
              orientation.
            </p>
          </article>

          <article className="border border-[#e4ddd3] bg-white/60 p-5">
            <h3 className="font-bold mb-2">Frame (pose)</h3>
            <p className="text-sm text-[#555] mb-2">
              Position t plus orientation (Euler, quaternion, or matrix).
            </p>
            <p className="text-sm text-[#666]">
              This is what uniquely places an object in world coordinates.
            </p>
          </article>
        </div>

        <div className="border border-[#e4ddd3] bg-white/70 p-6">
          <h3 className="font-bold mb-3">Practical rule of thumb</h3>
          <p className="text-[#555] leading-relaxed">
            If your data has only Euler angles or only a quaternion, you still need
            an origin (translation) to define a full frame. If you have both
            translation and orientation, you have a complete 3D pose.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-6">Equivalently valid definitions</h2>
        <div className="space-y-4">
          {methods.map((method) => (
            <article
              key={method.title}
              className="border border-[#e4ddd3] bg-white/50 p-6"
            >
              <h3 className="text-lg font-bold mb-2">{method.title}</h3>
              <p className="text-[#444] mb-2">{method.idea}</p>
              <p className="text-sm text-[#666]">
                <span className="font-semibold">Uniqueness condition:</span>{" "}
                {method.unique}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
