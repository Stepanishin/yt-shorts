import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import HeaderNew from "./components/HeaderNew";
import Footer from "./components/Footer";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ModalProvider } from "./contexts/ModalContext";
import SessionProvider from "./components/SessionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shorts Generator - Create Viral YouTube Shorts",
  description: "Automatically generate engaging YouTube Shorts with jokes in seconds",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <SessionProvider>
          <LanguageProvider>
            <ModalProvider>
              <HeaderNew />
              <main className="flex-grow">
                {children}
              </main>
              <Footer />
            </ModalProvider>
          </LanguageProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
