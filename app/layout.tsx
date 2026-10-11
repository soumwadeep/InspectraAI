import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "@/app/globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: {
    default: "Inspectra AI — Vision Command OS",
    template: "%s · Inspectra AI",
  },
  description:
    "Inspectra AI: See the problem. Investigate the cause. Act before failure. Agentic computer vision for industrial equipment inspection.",
  icons: [{ rel: "icon", url: "/favicon.svg" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // No class here: next-themes owns the theme class on <html> and writes it
    // with a blocking script. Hardcoding "dark" fought it and left the element
    // reporting "system".
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} bg-background text-primary-text`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
