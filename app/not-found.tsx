import NotFoundPage from "@/components/not-found-page";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found — dirty-geometry",
  description: "This page does not exist or has been moved.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <NotFoundPage />;
}
