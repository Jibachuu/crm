import "./inbox-theme.css";
import { ToasterProvider } from "@/components/inbox/Toaster";

// Шрифт — Apple-first (SF Pro / Segoe UI / Roboto), подтягивается
// системный. Ничего не self-hostим — на каждой ОС родные типографика
// и эмодзи выглядят чище, чем принудительный Roboto с сервера.

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToasterProvider>
      <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </ToasterProvider>
  );
}
