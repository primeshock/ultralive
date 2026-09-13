import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { SiteHeader } from "@/components/site-header";

const vazirmatn = Vazirmatn({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
});

export const metadata = {
  title: "Koosha Live",
  description: "پلتفرم استریم زنده",
};

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
