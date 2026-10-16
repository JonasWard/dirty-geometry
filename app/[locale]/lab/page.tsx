import LabHub from "@/components/lab/lab-hub";
import { labMetadata } from "@/components/lab/lab-routes";
import Main from "@/components/main";
import { Metadata } from "next";
import type { Props } from "../route-params";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return labMetadata(locale);
}

export default async function Lab({ params }: Readonly<Props>) {
  const { locale } = await params;
  return (
    <Main locale={locale} page="lab">
      <LabHub locale={locale} />
    </Main>
  );
}
