import "./globals.css";
import React from "react";
import { Inter, Jost } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jost = Jost({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jost",
  weight: ["900"],
  style: ["italic"],
});

export const metadata = {
  title: "litopc",
  description: "Educational optical proximity correction sandbox",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jost.variable}`}>{children}</body>
    </html>
  );
}
