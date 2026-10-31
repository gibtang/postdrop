import type { Metadata } from "next";
import { ViewClient } from "./view-client";

export const metadata: Metadata = {
  title: "A one-time secret | Postdrop",
  robots: { index: false, follow: false },
};

export default async function SecretViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ViewClient token={token} />;
}
