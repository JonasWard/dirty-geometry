"use client";

import dynamic from "next/dynamic";
// The node view (React Flow) styles; global CSS has to come in through the app.
import "@xyflow/react/dist/style.css";

// The playground reads the URL hash and draws with three.js, so it only renders in the browser.
const Playground = dynamic(() => import("@dirty-geometry/visualisation/playground").then((module) => module.Playground), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-[420px] w-full border border-dg-border bg-[#0b0d12]" />,
});

export default function PlaygroundClient() {
  return <Playground />;
}
