import { OverlayHeader } from "@/components/organisms/overlay/OverlayHeader";

export default function OverlayLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen bg-app-subtle px-4 py-8 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl content-center gap-6">
        <OverlayHeader />
        {children}
      </div>
    </main>
  );
}
