import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

// Singleton client — persists across requests in the same process
let _client: TelegramClient | null = null;

export async function getTelegramClient(): Promise<TelegramClient> {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH ?? "";
  const sessionStr = process.env.TELEGRAM_SESSION ?? "";

  if (!apiId || !apiHash || !sessionStr) {
    throw new Error("Telegram не настроен. Добавьте TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION в .env.local");
  }

  if (!_client) {
    _client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
      connectionRetries: 5,
      retryDelay: 1000,
    });
  }

  if (!_client.connected) {
    await _client.connect();
  }

  return _client;
}
