import { OverlayHeader } from "@/components/organisms/overlay/OverlayHeader";

export default function OverlayLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main
      className="min-h-screen px-4 pt-4 pb-16 text-ink sm:px-6 lg:px-8"
      style={{
        backgroundImage: "linear-gradient(180deg, #FFFFFF 0%, #FDD5DF 100%)",
        // backgroundImage: "url('/images/bg01.jpg')",
        // backgroundSize: "cover",
        // backgroundPosition: "top",
        // backgroundRepeat: "no-repeat",
      }}
    >
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl content-center gap-6">
        <OverlayHeader />
        {children}
      </div>
    </main>
  );
}
