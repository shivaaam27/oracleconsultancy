import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TopPill } from "@/components/top-pill";
import { SidebarServer } from "@/components/sidebar-server";
import { MobileSidebarServer } from "@/components/mobile-sidebar-server";
import { CompanyScopeServer } from "@/components/company-scope-server";
import { CommandPaletteProvider } from "@/components/command-palette";
import { RecentsTracker } from "@/components/recents-tracker";
import { ToastProvider } from "@/components/toast";
import { UndoBanner } from "@/components/undo-banner";
import { DensityScript } from "@/components/density-toggle";
import { PageTransition } from "@/components/page-transition";
import { TaskDrawer } from "@/components/task-drawer";
import { PersonDrawer } from "@/components/person-drawer";
import { FloatingAssistant } from "@/components/floating-assistant";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { IosResume } from "@/components/ios-resume";
import { CaptureWizardMount } from "@/components/capture-wizard-mount";

export const metadata: Metadata = {
  title: "COS — Oracle Group Operations",
  description: "Chief of Staff Command Center",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "COS" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lock zoom so focusing a small input doesn't trigger iOS Safari's auto-zoom
  // (and the resulting layout misalignment). The app behaves like a native shell.
  maximumScale: 1,
  userScalable: false,
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
              <div className="md:flex md:h-[100svh] md:overflow-hidden">
                <Suspense>
                  <SidebarServer />
                </Suspense>
                <main className="flex-1 md:overflow-y-auto pt-6 px-4 sm:px-6 lg:px-8 pb-28 md:pb-10">
                  <div className="mx-auto max-w-[1100px]">
                    <PageTransition>{children}</PageTransition>
                  </div>
                </main>
              </div>
              <TopPill scopeSlot={<CompanyScopeServer />} />
              <Suspense>
                <MobileSidebarServer />
              </Suspense>
              <Suspense>
                <TaskDrawer />
              </Suspense>
              <Suspense>
                <PersonDrawer />
              </Suspense>
              <FloatingAssistant />
              <ServiceWorkerRegister />
              <IosResume />
              <Suspense>
                <CaptureWizardMount />
              </Suspense>
            </CommandPaletteProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
