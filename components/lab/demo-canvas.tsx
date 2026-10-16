"use client";

import dynamic from "next/dynamic";

// three.js / react-three-fiber need the browser, so the viewer is never rendered during static export.
const DemoViewer = dynamic(() => import("@dirty-geometry/visualisation").then((module) => module.DemoViewer), {
  ssr: false,
  loading: () => <div className="h-[75vh] min-h-[480px] w-full border border-dg-border bg-[#0b0d12]" />,
});

export default function DemoCanvas({ library, id }: { library: string; id: string }) {
  return <DemoViewer library={library} id={id} />;
}
