import { redirect } from "next/navigation";

export default async function LegacyOpcLabRedirect({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  const suffix = slug.length ? `/${slug.join("/")}` : "";
  redirect(`/litopc${suffix}`);
}
