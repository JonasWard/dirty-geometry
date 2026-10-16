import LibraryIndex from "@/components/lab/library-index";
import { libraryMetadata, libraryParams, requireLibrary } from "@/components/lab/lab-routes";
import Main from "@/components/main";
import { Metadata } from "next";

type Props = { params: Promise<{ locale?: string; library: string }> };

export const dynamicParams = false;
export const generateStaticParams = libraryParams;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, library } = await params;
  return libraryMetadata(library, locale);
}

export default async function Library({ params }: Readonly<Props>) {
  const { locale, library: raw } = await params;
  const library = requireLibrary(raw);
  return (
    <Main locale={locale} page={library}>
      <LibraryIndex locale={locale} library={library} />
    </Main>
  );
}
