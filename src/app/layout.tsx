import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { MotionConfig } from "framer-motion";
import { Inter } from "next/font/google";
import "./globals.css";

// One self-hosted webfont so the app renders identically on every device
// (Windows/iPhone/Mac), instead of the per-device system font. Exposed as the
// CSS variable --font-inter, which globals.css feeds into --font-sans.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
import { ThemeProvider } from "@/components/theme-provider";
import { TopPillServer } from "@/components/top-pill-server";
import { CommandPaletteProvider } from "@/components/command-palette";
import { RecentsTracker } from "@/components/recents-tracker";
import { ToastProvider } from "@/components/toast";
import { UndoBanner } from "@/components/undo-banner";
import { DensityScript } from "@/components/density-toggle";
import { FocusScript } from "@/components/focus-mode";
import { PortalPrefsScript } from "@/components/portal-prefs";
import { PageTransition } from "@/components/page-transition";
import { ContextActionsProvider } from "@/components/context-actions";
import { GlobalDrawers } from "@/components/global-drawers";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { IosResume } from "@/components/ios-resume";
import { CaptureWizardMount } from "@/components/capture-wizard-mount";
import { LiquidGlassDefs } from "@/components/liquid-glass";
import { HideOnPortal } from "@/components/hide-on-portal";
import { getAppSettings } from "@/lib/settings";
import { appBaseUrl } from "@/lib/app-url";

export const metadata: Metadata = {
  // Absolute base so link-preview crawlers (WhatsApp/Twilio) resolve OG image URLs.
  metadataBase: new URL(appBaseUrl()),
  title: "Oracle Consultancy Limited — Operations",
  description: "Chief-of-Staff command centre for Oracle Consultancy",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Oracle Consultancy" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Branded card shown when a portal link is shared in WhatsApp/chat.
  openGraph: {
    type: "website",
    siteName: "Oracle Consultancy",
    title: "Oracle Consultancy · Staff portal",
    description: "Your tasks, leave and updates — sign in to your staff portal.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Oracle Consultancy" }],
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
  const { operatorName, voiceLanguage } = await getAppSettings();
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <DensityScript />
        <FocusScript />
        <PortalPrefsScript />
      </head>
      <body>
        <ThemeProvider>
          <MotionConfig reducedMotion="user">
          <ToastProvider>
            <UndoBanner />
            <Suspense>
            <CommandPaletteProvider operatorName={operatorName} voiceLanguage={voiceLanguage}>
              <RecentsTracker />
              <ContextActionsProvider>
                <main className="pt-6 px-4 sm:px-6 lg:px-8 pb-28 md:pb-32">
                  <div className="mx-auto max-w-[1100px]">
                    <PageTransition>{children}</PageTransition>
                  </div>
                </main>
                {modal}
                <HideOnPortal>
                  <Suspense>
                    <TopPillServer />
                  </Suspense>
                </HideOnPortal>
              </ContextActionsProvider>
              <HideOnPortal>
                <GlobalDrawers />
              </HideOnPortal>
              <ServiceWorkerRegister />
              <IosResume />
              <LiquidGlassDefs />
              <HideOnPortal>
                <Suspense>
                  <CaptureWizardMount />
                </Suspense>
              </HideOnPortal>
            </CommandPaletteProvider>
            </Suspense>
          </ToastProvider>
          </MotionConfig>
        </ThemeProvider>
      </body>
    </html>
  );
}
