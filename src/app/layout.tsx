import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CANVAS } from "@/lib/palette";
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
  title: "EcoQuest PH",
  description: "Gamified climate action for the Philippines",
  icons: { apple: "/icons/apple-touch-icon.png" },
  // Opened from the iPhone Home Screen, it runs full screen like an app.
  appleWebApp: { capable: true, title: "EcoQuest", statusBarStyle: "black" },
};

// Dark-only design: dark form controls/scrollbars, and tint the mobile browser bar to the canvas.
export const viewport: Viewport = {
  themeColor: CANVAS,
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
