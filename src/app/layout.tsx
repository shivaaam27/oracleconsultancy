import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TopPill } from "@/components/top-pill";
import { CommandPaletteProvider } from "@/components/command-palette";
import { RecentsTracker } from "@/components/recents-tracker";
import { ToastProvider } from "@/components/toast";
import { UndoBanner } from "@/components/undo-banner";
import { DensityScript } from "@/components/density-toggle";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = {
  title: "COS — Oracle Group Operations",
  description: "Chief of Staff Command Center",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <DensityScript />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <UndoBanner />
            <CommandPaletteProvider>
              <RecentsTracker />
              <TopPill />
              <main className="pt-20 px-4 sm:px-6 lg:px-10 pb-12 mx-auto max-w-[1400px]">
                <PageTransition>{children}</PageTransition>
              </main>
            </CommandPaletteProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
