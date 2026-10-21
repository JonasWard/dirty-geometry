import LabHub from "@/components/lab/lab-hub";
import { labMetadata } from "@/components/lab/lab-routes";
import { labCrumbs } from "@/components/lab/crumbs";
import Main from "@/components/main";
import { defaultLocale } from "@/config";
import { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  return labMetadata(defaultLocale);
}

export default function Lab() {
  return (
    <Main locale={defaultLocale} page="lab" crumbs={labCrumbs(defaultLocale)}>
      <LabHub locale={defaultLocale} />
    </Main>
  );
}
