import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM система",
  description: "Корпоративная CRM система",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CRM",
  },
};

export const viewport: Viewport = {
  themeColor: "#1e293b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full" suppressHydrationWarning>
      <body className="min-h-full bg-slate-50 antialiased" suppressHydrationWarning>
          {children}
          <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}` }} />
        </body>
    </html>
  );
}
