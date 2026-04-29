import FrameBody from "@/components/frame-body";
import { Metadata } from "next";
import Main from "@/components/main";
import type { Props } from "../route-params";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: `3D Frame Definitions — dirty-geometry`,
    description: `Visual guide to uniquely defining a 3D frame (${locale ?? "en"} route).`,
  };
}

export default async function FramePage({ params }: Readonly<Props>) {
  const { locale } = await params;

  return (
    <Main locale={locale} page="frame">
      <FrameBody />
    </Main>
  );
}
