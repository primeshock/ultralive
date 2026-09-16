import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { SiteHeader } from "@/components/site-header";
import { API_URL } from "@/lib/api";

const vazirmatn = Vazirmatn({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
});

async function getSiteBrand() {
  try {
    const response = await fetch(`${API_URL}/api/site`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function generateMetadata() {
  const brand = await getSiteBrand();
  const title = brand?.browserTabTitle || brand?.siteName || "Koosha Live";
  const faviconUrl = brand?.faviconUrl || undefined;

  return {
    title,
    description: "پلتفرم استریم زنده",
    icons: { icon: faviconUrl || "/window.svg" },
  };
}

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <AuthProvider>
            <SiteHeader />
            <main className="flex-1 flex flex-col">{children}</main>
          </AuthProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
