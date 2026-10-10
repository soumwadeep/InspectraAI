import { GeistSans, GeistMono } from "geist/font";

export const metadata = {
  title: "Inspectra AI — Autonomous Visual Inspection Platform",
  description:
    "Inspectra AI: See the problem. Investigate the cause. Act before failure. Agentic computer vision for industrial equipment inspection.",
  icons: [{ rel: "icon", url: "/favicon.svg" }],
};

const geistSans = GeistSans;
const geistMono = GeistMono;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body
        className={[geistSans.variable, geistMono.variable].join(" ")}
        style={{
          fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
          fontVariantLigatures: "common-ligatures",
        }}
      >
        {children}
      </body>
    </html>
  );
}
