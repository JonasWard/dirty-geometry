import FrameBody from "@/components/frame-body";
import { defaultLocale } from "@/config";
import { Metadata } from "next";
import Main from "@/components/main";

export const metadata: Metadata = {
  title: `3D Frame Definitions — dirty-geometry`,
  description:
    "Visual guide to uniquely defining a 3D frame (position + orientation).",
};

export default function FramePage() {
  return (
    <Main locale={defaultLocale} page="frame">
      <FrameBody />
    </Main>
  );
}
