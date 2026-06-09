import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "caleiDOS",
  description: "a browser desktop where an agent builds real apps live",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
