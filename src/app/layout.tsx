import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { MotionConfig } from "framer-motion";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TopPillServer } from "@/components/top-pill-server";
import { CommandPaletteProvider } from "@/components/command-palette";
import { RecentsTracker } from "@/components/recents-tracker";
import { ToastProvider } from "@/components/toast";
import { UndoBanner } from "@/components/undo-banner";
import { DensityScript } from "@/components/density-toggle";
import { PageTransition } from "@/components/page-transition";
import { ContextActionsProvider } from "@/components/context-actions";
import { TaskDrawer } from "@/components/task-drawer";
import { PersonDrawer } from "@/components/person-drawer";
import { FloatingAssistant } from "@/components/floating-assistant";
import { AssistantSuggestions } from "@/components/assistant-suggestions";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { IosResume } from "@/components/ios-resume";
import { CaptureWizardMount } from "@/components/capture-wizard-mount";
import { LiquidGlassDefs } from "@/components/liquid-glass";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "AUMIO — Oracle Consultancy Operations",
  description: "Chief of Staff Command Center",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "AUMIO" },
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

export default async function RootLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const { operatorName } = await getAppSettings();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <DensityScript />
      </head>
      <body>
        <ThemeProvider>
          <MotionConfig reducedMotion="user">
          <ToastProvider>
            <UndoBanner />
            <CommandPaletteProvider>
              <RecentsTracker />
              <ContextActionsProvider>
                <main className="pt-6 px-4 sm:px-6 lg:px-8 pb-28 md:pb-32">
                  <div className="mx-auto max-w-[1100px]">
                    <PageTransition>{children}</PageTransition>
                  </div>
                </main>
                {modal}
                <Suspense>
                  <TopPillServer />
                </Suspense>
              </ContextActionsProvider>
              <Suspense>
                <TaskDrawer />
              </Suspense>
              <Suspense>
                <PersonDrawer />
              </Suspense>
              <Suspense>
                <FloatingAssistant operatorName={operatorName} />
              </Suspense>
              <Suspense>
                <AssistantSuggestions />
              </Suspense>
              <ServiceWorkerRegister />
              <IosResume />
              <LiquidGlassDefs />
              <Suspense>
                <CaptureWizardMount />
              </Suspense>
            </CommandPaletteProvider>
          </ToastProvider>
          </MotionConfig>
        </ThemeProvider>
      </body>
    </html>
  );
}
