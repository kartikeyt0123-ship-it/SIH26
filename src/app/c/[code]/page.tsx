import type { Metadata } from "next";
import { CustomerApp } from "./CustomerApp";

export const metadata: Metadata = {
  title: "Design your space",
};

export default async function CustomerSessionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <CustomerApp code={code.toUpperCase()} />;
}
