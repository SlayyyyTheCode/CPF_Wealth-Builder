import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { ToastProvider } from "@/components/toast";
import { ConfirmProvider } from "@/components/confirm-dialog";
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
  title: "CPF Wealth Builder",
  description: "CPF planning dashboard for advisors — works on phone, tablet and desktop",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // allow user pinch-zoom for accessibility
  maximumScale: 5,
};

// Open the DNS/TLS connection to the API origin during page load so the first
// data fetch doesn't pay the handshake cost. Cuts latency on every device.
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").origin;
  } catch {
    return null;
  }
})();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {apiOrigin && (
        <head>
          <link rel="preconnect" href={apiOrigin} crossOrigin="anonymous" />
          <link rel="dns-prefetch" href={apiOrigin} />
        </head>
      )}
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <ToastProvider>
            <ConfirmProvider>
              {children}
            </ConfirmProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
