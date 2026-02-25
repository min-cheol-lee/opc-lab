import "./globals.css";
import React from "react";

export const metadata = {
  title: "OPC Lab",
  description: "Educational OPC / lithography sandbox",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
