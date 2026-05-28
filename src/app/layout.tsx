import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TopPill } from "@/components/top-pill";
import { CompanyScopeServer } from "@/components/company-scope-server";
import { CommandPaletteProvider } from "@/components/command-palette";
import { RecentsTracker } from "@/components/recents-tracker";
import { ToastProvider } from "@/components/toast";
import { UndoBanner } from "@/components/undo-banner";
import { DensityScript } from "@/components/density-toggle";
import { PageTransition } from "@/components/page-transition";
import { TaskDrawer } from "@/components/task-drawer";
import { PersonDrawer } from "@/components/person-drawer";

export const metadata: Metadata = {
  title: "COS — Oracle Group Operations",
  description: "Chief of Staff Command Center",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "COS" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
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
              <main className="pt-6 px-4 sm:px-6 lg:px-8 pb-28 mx-auto max-w-[1200px]">
                <PageTransition>{children}</PageTransition>
              </main>
              <TopPill scopeSlot={<CompanyScopeServer />} />
              <Suspense>
                <TaskDrawer />
              </Suspense>
              <Suspense>
                <PersonDrawer />
              </Suspense>
            </CommandPaletteProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
