import DemoPage from "@/components/lab/demo-page";
import { demoMetadata, demoParams, requireDemo } from "@/components/lab/lab-routes";
import Main from "@/components/main";
import { Metadata } from "next";

type Props = { params: Promise<{ locale?: string; library: string; demo: string }> };

export const dynamicParams = false;
export const generateStaticParams = demoParams;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, library, demo } = await params;
  return demoMetadata(library, demo, locale);
}

export default async function Demo({ params }: Readonly<Props>) {
  const { locale, library, demo: id } = await params;
  const demo = requireDemo(library, id);
  return (
    <Main locale={locale} page={demo.library}>
      <DemoPage locale={locale} demo={demo} />
    </Main>
  );
}
