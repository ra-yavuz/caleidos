import AppRenderer from "./AppRenderer";

// Standalone route to render one app full-bleed. Useful for opening an app in
// its own tab / debugging; the desktop also reuses AppRenderer inline in
// windows. params is async in Next.js 15.
export default async function RenderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="h-screen w-screen bg-white text-neutral-900">
      <AppRenderer slug={slug} />
    </div>
  );
}
