import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import * as readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const q = (p) => new Promise((r) => rl.question(p, r));

const client = new TelegramClient(
  new StringSession(""),
  32773382,
  "2dff0353addc3397ba1ad8ec70f2daaa",
  { connectionRetries: 3 }
);

await client.start({
  phoneNumber: async () => q("Номер телефона (+7...): "),
  password: async () => q("Пароль 2FA (Enter если нет): "),
  phoneCode: async () => q("Код из Telegram: "),
  onError: (e) => console.error(e),
});

console.log("\n✅ Скопируйте в .env.local:\n");
console.log("TELEGRAM_SESSION=" + client.session.save());

await client.disconnect();
rl.close();
