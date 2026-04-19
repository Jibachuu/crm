# Claude Memory Export — Artevo CRM
# Скопируй этот файл в новую сессию Claude Code как контекст

## User Profile
User is an admin/marketer building a CRM for a team of 5. She manages the CRM system herself (full access, runs migrations, configures integrations). The business serves hospitality venues (restaurants, hotels, salons, spas).
User prefers: practical, no-nonsense implementations. Bitrix24-style UI. Russian language throughout the interface.

## CRM Tech Stack
- Next.js 16.2.2 App Router + TypeScript + Tailwind v4 + Supabase
- Deployed on VPS: artevo-crm.ru (NOT Vercel anymore)
- GitHub: Jibachuu/crm
- Auto-deploy via GitHub Actions on push to main
- Design: sidebar #1e2330, primary #0067a5, border #e4e4e4, bg #f5f5f5

## VPS Infrastructure
- Timeweb Cloud, 2GB RAM, Ubuntu, IP: 72.56.243.123
- Domain: artevo-crm.ru (SSL via Let's Encrypt, nginx reverse proxy)
- SSH key: ~/.ssh/id_ed25519_crm (user Mi, key name claude-crm-automation)
- Services (systemd):
  - **crm-app** (port 3000) — Next.js, /opt/crm-app
  - **max-proxy** (port 3100) — MAX WebSocket proxy, /opt/max-proxy
  - **telegram-proxy** (port 3300) — gramJS singleton, /opt/telegram-proxy
  - **whatsapp-proxy** (port 3400) — whatsapp-web.js, /opt/whatsapp-proxy **← НОВЫЙ, не развёрнут**
  - **auto-leads-cron** — every 10 min, Telegram + MAX scan
  - **email-watcher** — IMAP polling, /opt/email-watcher
- .env.local on VPS must NOT be overwritten during deploy
- Deploy: GitHub Actions auto-deploy (git pull + npm install + next build + restart)

## DB Schema (key tables)
users, companies, contacts, leads, deals, products, product_variants, lead_products, deal_products, communications, tasks, custom_fields, funnels, funnel_stages, invoices, invoice_items, quotes, quote_items, cold_calls, contracts, permissions, **inbox_messages (v57)**

## Key Patterns
- Admin client (createAdminClient) bypasses RLS — used on ALL detail/list pages
- fetchAll() paginates past Supabase 1000-row limit
- Product blocks: 'request'=Запрос, 'order'=Заказ in lead/deal_products
- Lead→Deal conversion via /api/leads/[id]/convert
- Cold calls import from XLSX with column mapping

## Integrations
- **Telegram** — MTProto via gramJS proxy on VPS port 3300
- **MAX (МАКС)** — WebSocket proxy on VPS port 3100, token in systemd env
- **WhatsApp** — whatsapp-web.js proxy on VPS port 3400 *(код готов, ждёт установки)*
- **ВКонтакте** — Callback API сообщества *(код готов, ждёт токенов)*
- **Avito** — Messenger API v3 + OAuth2 *(код готов, ждёт токенов)*
- **Email** — SMTP/IMAP via mail.hosting.reg.ru (art-evo.ru domain)
- **Novofon** — telephony (was Zadarma, fully removed). API keys in .env.local
  - Webhook: https://artevo-crm.ru/api/novofon/webhook
  - 4 notifications configured: incoming, outgoing, end, record
  - WebRTC via JsSIP: wss://sip.novofon.ru/ws (SIP login/password per user)
  - WebPhone component in CRM layout
  - Numbers: +7(843)212-69-69, +7(843)212-67-77
- **DaData** — company lookup by INN
- **AI** — Anthropic Claude API for chat/analysis
- **QR on invoices** — CBR ST00012 standard for bank payments

## Current Features
Leads (table+kanban+funnel stages), Deals (table+kanban+products), Contacts/Companies, Products (stock), Cold Calls (import XLSX, 44 columns, click-to-call), Invoices (with QR), Quotes (KP, **с НДС 20% v56**), Contracts, Telegram inbox (+edit/delete), MAX inbox (+edit/delete), **VK/Avito/WhatsApp inbox**, Email (inbox+campaigns), Team chat, Tasks, Analytics, Notifications, Permissions, PWA, Mobile sidebar+bottom tabs, Call recordings (Whisper STT ready), Survey discount checkbox, Samples (SelectOrCreate contact search)

## Important Notes
- Zadarma completely removed — only Novofon
- All pages use admin client (not supabase with RLS) to avoid 404s
- Incoming calls auto-create contact + lead
- Auto-leads cron scans Telegram + MAX every 10 min
- Cold calls: boolean call_reached, numeric revenue/profit fields need type conversion on import
- Migrations v50-v55 added: company_status, extra phones/emails, user phone/SIP, transcript, survey_discount, sip_login/password

---

# === ОБНОВЛЕНИЕ 2026-04-19: Ветка `claude/review-memory-export-q8iQG` ===

## Что сделано (3 этапа, 3 коммита)

### Этап 1 — быстрые фиксы (коммит `d74f777`)
1. **Файлы к сделке** — `supabase/migration_v56.sql`:
   - RLS-политики на `deal_files` (SELECT/INSERT/DELETE для authenticated)
   - Создание bucket `attachments` + storage policies
   - Колонки в `quotes`: `vat_enabled BOOLEAN`, `vat_amount NUMERIC`
2. **Скролл мессенджеров** — `src/components/ui/TelegramChat.tsx`, `MaxChat.tsx`:
   - Sync-расчёт «был ли внизу» внутри useEffect (не через ref)
   - Порог 120px
   - Кнопка «⬇ к новому сообщению» появляется, когда пользователь скроллил вверх
3. **НДС 20% в КП** — `QuotesList.tsx` + `api/quotes/route.ts` + `q/[id]/page.tsx`:
   - Чекбокс «НДС 20%» в форме, строки «НДС» и «Итого с НДС» в публичной КП
4. **survey_discount** — `EditContactModal.tsx`, `EditLeadModal.tsx`, `api/contacts/route.ts` whitelist
5. **Поиск контактов в пробниках** — `SamplesList.tsx`: `<select>` → `<SelectOrCreate>`

### Этап 2 — функциональные доработки (коммит `8e02d5f`)
1. **Кнопка «В сделку» в списке и канбане лидов** — `LeadsList.tsx`:
   - Колонка действий в табличном виде
   - ArrowRightCircle на карточке канбана (с `e.stopPropagation()` чтоб не мешал drag)
   - `router.push(/deals/${dealId})` после успеха
2. **Полный перенос лид→сделка** — `api/leads/[id]/convert/route.ts`:
   - Копируются ОБА блока `lead_products` ('request' и 'order')
   - **COPY** (не move) — communications и tasks дублируются с `entity_type='deal'`
   - Возвращает `{dealId, products, comments, tasks}`
3. **Telegram: поиск по телефону** — `InboxClient.tsx`:
   - Кнопка «+ Новый чат» с модалкой (username / phone режим)
   - Поля firstName/lastName для phone-режима
   - Обработка ошибок: «не зарегистрирован / скрыт приватностью / укажите с +7...»
4. **Edit/Delete собственных сообщений (TG + MAX)** — `TelegramChat.tsx`, `MaxChat.tsx`:
   - Three-dot menu на hover для outbound сообщений
   - Inline textarea для редактирования
   - `PATCH/DELETE /api/telegram/message` (NEW endpoint) → прокси `/edit-message`, `/delete-message`
   - MAX: actions `edit_message`/`delete_message` в `/api/max/route.ts` → прокси opcodes **66/67 (best-guess!)**
   - `telegram-proxy/server.js`: `Api.messages.EditMessage`, `Api.messages.DeleteMessages({revoke:true})`, `Api.channels.DeleteMessages` для каналов
   - `max-proxy/server.js` + `server-v2.js`: `/edit-message`, `/delete-message` endpoints

### Этап 3 — интеграции WhatsApp + Avito + ВК (коммит `bbfc1a9`)
1. **Миграция** — `supabase/migration_v57.sql`:
   - Расширение enum `communication_channel`: +`whatsapp`, +`avito`, +`vk`
   - `contacts.whatsapp_phone`, `contacts.avito_profile_id`, `contacts.vk_id`
   - Новая таблица `inbox_messages` (channel, chat_id, external_id, direction, sender_name, text, attachments JSONB, sent_at, contact_id)
   - Unique (channel, external_id), RLS all-authenticated policy, индексы
2. **Универсальный UI** — `src/components/ui/ChannelChat.tsx` (NEW):
   - Работает для vk/avito/whatsapp
   - Poll `/api/{channel}/messages?chat_id=…` каждые 10 сек
   - Send через `/api/{channel}/send`
3. **ВК**:
   - `src/app/api/webhooks/vk/route.ts` — confirmation + message_new (+ optional `VK_SECRET_KEY`)
   - `src/app/api/vk/send/route.ts` — `messages.send` через `VK_GROUP_TOKEN`
   - `src/app/api/vk/messages/route.ts` — список чатов/история
4. **Avito**:
   - `src/app/api/webhooks/avito/route.ts` — payload `message`, выставляет direction по `AVITO_USER_ID`
   - `src/app/api/avito/send/route.ts` — OAuth2 client_credentials (кэш токена в памяти)
   - `src/app/api/avito/messages/route.ts` — список/история
5. **WhatsApp**:
   - `whatsapp-proxy/` (NEW directory): `package.json`, `server.js`, `whatsapp-proxy.service`
   - HTTP API :3400 с `API_KEY`, endpoints `/status`, `/qr`, `/send`, `/check-number`
   - QR печатается в консоль через `qrcode-terminal` при первом запуске
   - Incoming messages → POST на `CRM_WEBHOOK_URL` с `x-webhook-secret`
   - `src/app/api/webhooks/whatsapp/route.ts` — сверяет по `whatsapp_phone` ИЛИ `phone`/`phone_mobile` по last 10 digits
   - `src/app/api/whatsapp/send/route.ts` — `fetch(WA_PROXY_URL/send)`
   - `src/app/api/whatsapp/messages/route.ts` — список/история
6. **Inbox UI** — `AllMessengersInbox.tsx`:
   - Channel type + CHANNEL_COLORS расширены (vk=#4a76a8, avito=#00a046, whatsapp=#25d366)
   - Load loop для трёх новых каналов
   - Render branch через `<ChannelChat />`

## Статус: всё закоммичено и запушено на `claude/review-memory-export-q8iQG`. `tsc --noEmit` — чисто.

---

## Что нужно сделать ПОЛЬЗОВАТЕЛЮ перед запуском (я сам этого НЕ могу — SSH доступа у меня нет)

### 1. Применить миграции в Supabase (Studio → SQL Editor)
```
-- Открыть и выполнить файлы из ветки claude/review-memory-export-q8iQG:
supabase/migration_v56.sql  -- RLS deal_files, bucket attachments, quotes VAT
supabase/migration_v57.sql  -- enum channels, contacts phones, inbox_messages
```
Прямые ссылки (нужно переключить dropdown ветки на `claude/review-memory-export-q8iQG`):
- https://github.com/Jibachuu/crm/tree/claude/review-memory-export-q8iQG/supabase

### 2. Добавить env-переменные на VPS (`/opt/crm-app/.env.local`) и сделать `sudo systemctl restart crm-app`

```bash
# ВК (Настройки сообщества → Работа с API → Callback API)
VK_GROUP_TOKEN=vk1.a.xxxxxxxxxxxx           # Ключ доступа сообщества с правами messages
VK_CONFIRMATION_TOKEN=abcd1234               # Строка подтверждения из первой вкладки
VK_SECRET_KEY=arbitrary-string               # Секрет (вторая вкладка, опционально)

# Avito (avito.ru/professionals/api → создать приложение)
AVITO_CLIENT_ID=xxxxxxxxxx                   # из приложения
AVITO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxx   # из приложения
AVITO_USER_ID=1234567                        # ваш user_id (из Avito API /core/v1/accounts/self)
AVITO_WEBHOOK_SECRET=any-random-string       # этот же задать при подписке на webhook

# WhatsApp (совпадают со значениями в whatsapp-proxy.service)
WA_PROXY_URL=http://127.0.0.1:3400
WA_PROXY_KEY=artevo-wa-proxy-2026
WA_WEBHOOK_SECRET=change-me-to-random-hex
```

### 3. Установить whatsapp-proxy на VPS (делает пользователь вручную по SSH)
```bash
ssh mi@72.56.243.123
sudo mkdir -p /opt/whatsapp-proxy && sudo chown mi:mi /opt/whatsapp-proxy
cd /opt/whatsapp-proxy
# скопировать 3 файла из репо (whatsapp-proxy/server.js, package.json, whatsapp-proxy.service)
scp -r whatsapp-proxy/* mi@72.56.243.123:/opt/whatsapp-proxy/    # или git clone + cp
npm install
# поправить CRM_WEBHOOK_SECRET внутри whatsapp-proxy.service на тот же что в .env.local
sudo cp whatsapp-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-proxy
sudo journalctl -u whatsapp-proxy -f
# → появится QR в консоли, отсканировать с WhatsApp mobile (Linked Devices)
```

Проверка: `curl -H "Authorization: artevo-wa-proxy-2026" http://127.0.0.1:3400/status`

### 4. Регистрация webhook-ов
- **ВК**: vk.com → Настройки сообщества → Работа с API → Callback API → URL `https://artevo-crm.ru/api/webhooks/vk`, тип события «Входящее сообщение», нажать «Подтвердить». Наш сервер вернёт `VK_CONFIRMATION_TOKEN`.
- **Avito**: `POST https://api.avito.ru/messenger/v1/webhook` с Bearer-токеном (из `getAccessToken()`), body `{"url":"https://artevo-crm.ru/api/webhooks/avito"}`. Секрет передаётся заголовком `x-webhook-secret` — он сверяется с `AVITO_WEBHOOK_SECRET`.
- **WhatsApp**: настройка встроена в `whatsapp-proxy.service` env `CRM_WEBHOOK_URL=https://artevo-crm.ru/api/webhooks/whatsapp`.

---

## Открытые технические вопросы

1. **MAX opcodes 66/67 для edit/delete — best-guess**. Если не заработают в проде:
   - Открыть DevTools → Network → WS на web.max.ru
   - Реально редактировать/удалить сообщение
   - Посмотреть `opcode` в исходящем frame
   - Поправить `max-proxy/server.js:` константы `EDIT_OPCODE`/`DELETE_OPCODE`
2. **WhatsApp-web.js риск бана** — используется user-agent десктопа. При нормальном объёме сообщений (до ~50 в день) бан маловероятен, но Meta может ужесточить. Долгосрочно — перейти на Meta Cloud API (требует верификации бизнеса: ~2 недели).
3. **Avito API rate limit** — пока не мониторим. Если упрёмся в 429, добавить backoff в `avito/send/route.ts`.
4. **ВК `messages.send` требует `random_id`** — сейчас используется `Date.now()`. Если ВК начнёт жаловаться на дубли — генерить через crypto.

---

## Полный файл-мап изменений

**NEW файлы:**
- `supabase/migration_v56.sql`
- `supabase/migration_v57.sql`
- `src/components/ui/ChannelChat.tsx`
- `src/app/api/telegram/message/route.ts`
- `src/app/api/webhooks/vk/route.ts`
- `src/app/api/vk/send/route.ts`
- `src/app/api/vk/messages/route.ts`
- `src/app/api/webhooks/avito/route.ts`
- `src/app/api/avito/send/route.ts`
- `src/app/api/avito/messages/route.ts`
- `src/app/api/webhooks/whatsapp/route.ts`
- `src/app/api/whatsapp/send/route.ts`
- `src/app/api/whatsapp/messages/route.ts`
- `whatsapp-proxy/server.js`
- `whatsapp-proxy/package.json`
- `whatsapp-proxy/whatsapp-proxy.service`

**MODIFIED файлы:**
- `src/components/ui/TelegramChat.tsx` — скролл + edit/delete + «⬇ к новому»
- `src/components/ui/MaxChat.tsx` — то же
- `src/app/(crm)/inbox/InboxClient.tsx` — модалка «Новый чат»
- `src/app/(crm)/inbox/AllMessengersInbox.tsx` — VK/Avito/WhatsApp вкладки
- `src/app/(crm)/leads/LeadsList.tsx` — кнопка «В сделку»
- `src/app/api/leads/[id]/convert/route.ts` — полный перенос
- `src/app/(crm)/quotes/QuotesList.tsx` — чекбокс НДС
- `src/app/api/quotes/route.ts` — расчёт vat_amount
- `src/app/q/[id]/page.tsx` — рендер НДС на публичной КП
- `src/app/(crm)/contacts/EditContactModal.tsx` — чекбокс survey_discount
- `src/app/(crm)/leads/EditLeadModal.tsx` — чекбокс survey_discount
- `src/app/api/contacts/route.ts` — whitelist survey_discount
- `src/app/(crm)/samples/SamplesList.tsx` — SelectOrCreate
- `src/app/(crm)/samples/page.tsx` — убрана предзагрузка
- `src/app/api/max/route.ts` — actions edit_message/delete_message
- `telegram-proxy/server.js` — /edit-message, /delete-message
- `max-proxy/server.js` + `server-v2.js` — /edit-message, /delete-message

## Коммиты в ветке `claude/review-memory-export-q8iQG`
- `d74f777` — Stage 1: быстрые фиксы (RLS/скролл/НДС/survey/samples)
- `8e02d5f` — Stage 2: лид→сделка + TG/MAX edit/delete + новый чат
- `bbfc1a9` — Stage 3: VK + Avito + WhatsApp интеграции
