import DemoPage from "@/components/lab/demo-page";
import { demoMetadata, demoParams, requireDemo } from "@/components/lab/lab-routes";
import { labCrumbs } from "@/components/lab/crumbs";
import Main from "@/components/main";
import { defaultLocale } from "@/config";
import { Metadata } from "next";

type Props = { params: Promise<{ library: string; demo: string }> };

export const dynamicParams = false;
export const generateStaticParams = demoParams;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { library, demo } = await params;
  return demoMetadata(library, demo, defaultLocale);
}

export default async function Demo({ params }: Readonly<Props>) {
  const { library, demo: id } = await params;
  const demo = requireDemo(library, id);
  return (
    <Main
      locale={defaultLocale}
      page={demo.library}
      crumbs={labCrumbs(defaultLocale, { library: demo.library, demo: demo.id })}
    >
      <DemoPage locale={defaultLocale} demo={demo} />
    </Main>
  );
}
