import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BAYK Tracker API",
  description:
    "Backend API for BAYK Sailboat Race Tracker — courses, boats, GPS tracks and auth",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
