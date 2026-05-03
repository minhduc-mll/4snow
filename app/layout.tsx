import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GlobalLanguageControl } from "@/components/organisms/global/GlobalLanguageControl";
import { Providers } from "@/components/shared/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Minh Duc & Tran Tuyet",
  description: "Created for Snow with Duc's love",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <GlobalLanguageControl />
        </Providers>
      </body>
    </html>
  );
}
