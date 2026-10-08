import type { Metadata } from "next";
import { LinkClient } from "./link-client";

export const metadata: Metadata = {
  title: "Postdrop",
  robots: { index: false, follow: false },
};

export default async function LinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <LinkClient token={token} />;
}
