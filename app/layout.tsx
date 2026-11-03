import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TasteLab · Seoul food diary",
  description: "Discover Seoul restaurants, cafés and little food adventures in four languages.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
