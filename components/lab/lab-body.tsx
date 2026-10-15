"use client";

import dynamic from "next/dynamic";

// three.js / react-three-fiber need the browser, so the viewer is never rendered during static export.
const LabViewer = dynamic(() => import("@/components/lab/lab-viewer"), {
  ssr: false,
  loading: () => <div className="h-[75vh] min-h-[480px] w-full bg-[#0b0d12]" />,
});

export default function LabBody() {
  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.45em] uppercase mb-6 text-dg-sky-600">
          2D Geometry Lab
        </p>
        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">
          Interactive demos of the vec2 library
        </h1>
        <p className="text-lg text-dg-muted leading-relaxed">
          Each tab runs a set of scenarios through <code>@dirty-geometry/vec2</code> and draws the result. Scroll to
          zoom, drag to pan.
        </p>
      </section>
      <LabViewer />
    </div>
  );
}
