import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { CommandPaletteProvider } from "@/components/command-palette";

export const metadata: Metadata = {
  title: "COS — Oracle Group Operations",
  description: "Chief of Staff Command Center",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <CommandPaletteProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 min-w-0">
                <Topbar />
                <main className="px-8 py-6 max-w-[1400px] fade-in">{children}</main>
              </div>
            </div>
          </CommandPaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
