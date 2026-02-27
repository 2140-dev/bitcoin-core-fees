import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Bitcoin Core Fee Rate Estimator",
  description: "Real-time Bitcoin fee estimation and mempool health analysis powered by Bitcoin Core.",
  icons: {
    icon: [
      {
        url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="%23f7931a"/><path d="M46.108 24.062c.302-2.022-1.235-3.109-3.336-3.834l.682-2.735-1.665-.415-.664 2.663c-.437-.109-.885-.213-1.333-.315l.669-2.683-1.665-.415-.682 2.735c-.363-.083-.72-.162-1.064-.249l.001-.004-2.3-.574-.444 1.783s1.237.284 1.211.301c.675.169.797.616.777.972l-.778 3.123c.047.012.108.028.174.047l-.174-.043-.1.433-1.093 4.385c-.083.204-.293.515-.765.398.017.024-1.211-.302-1.211-.302l-.829 1.911 2.171.542c.404.101.8.207 1.19.308l-.693 2.778 1.664.414.683-2.737c.454.124.897.24 1.33.35l-.68 2.727 1.666.415.693-2.779c2.847.54 4.99.321 5.89-2.251.725-2.07-.035-3.271-1.535-4.053 1.093-.253 1.917-.972 2.136-2.456zm-3.821 7.94c-.517 2.071-4.007.952-5.14.67l.918-3.682c1.132.282 4.75.84 4.222 3.012zm.517-7.982c-.469 1.887-3.37.928-4.312.693l.833-3.342c.94.235 3.96.676 3.479 2.649z" fill="%23fff"/></svg>',
        type: 'image/svg+xml',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
