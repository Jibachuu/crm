import { Roboto } from "next/font/google";
import "./inbox-theme.css";

// Roboto — родной шрифт Telegram Web. next/font/google скачивает файлы
// на этапе сборки и self-hostит, так что рантайм-запросов в google
// нет и РКН/Cloudflare не имеют значения. Прокидываем как CSS-переменную
// и подключаем через var(--tg-font) в inbox-theme.css.
const roboto = Roboto({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-roboto",
});

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={roboto.variable} style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {children}
    </div>
  );
}
