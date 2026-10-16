import LibraryIndex from "@/components/lab/library-index";
import { libraryMetadata, libraryParams, requireLibrary } from "@/components/lab/lab-routes";
import Main from "@/components/main";
import { defaultLocale } from "@/config";
import { Metadata } from "next";

type Props = { params: Promise<{ library: string }> };

export const dynamicParams = false;
export const generateStaticParams = libraryParams;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { library } = await params;
  return libraryMetadata(library, defaultLocale);
}

export default async function Library({ params }: Readonly<Props>) {
  const library = requireLibrary((await params).library);
  return (
    <Main locale={defaultLocale} page={library}>
      <LibraryIndex locale={defaultLocale} library={library} />
    </Main>
  );
}
