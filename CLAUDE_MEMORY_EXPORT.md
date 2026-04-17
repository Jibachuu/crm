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
  - **auto-leads-cron** — every 10 min, Telegram + MAX scan
  - **email-watcher** — IMAP polling, /opt/email-watcher
- .env.local on VPS must NOT be overwritten during deploy
- Deploy: GitHub Actions auto-deploy (git pull + npm install + next build + restart)

## DB Schema (key tables)
users, companies, contacts, leads, deals, products, product_variants, lead_products, deal_products, communications, tasks, custom_fields, funnels, funnel_stages, invoices, invoice_items, quotes, quote_items, cold_calls, contracts, permissions

## Key Patterns
- Admin client (createAdminClient) bypasses RLS — used on ALL detail/list pages
- fetchAll() paginates past Supabase 1000-row limit
- Product blocks: 'request'=Запрос, 'order'=Заказ in lead/deal_products
- Lead→Deal conversion via /api/leads/[id]/convert
- Cold calls import from XLSX with column mapping

## Integrations
- **Telegram** — MTProto via gramJS proxy on VPS port 3300
- **MAX (МАКС)** — WebSocket proxy on VPS port 3100, token in systemd env
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
Leads (table+kanban+funnel stages), Deals (table+kanban+products), Contacts/Companies, Products (stock), Cold Calls (import XLSX, 44 columns, click-to-call), Invoices (with QR), Quotes (KP), Contracts, Telegram inbox, MAX inbox, Email (inbox+campaigns), Team chat, Tasks, Analytics (leads+deals+calls), Notifications, Permissions, PWA (manifest+SW), Mobile sidebar+bottom tabs, Call recordings (Whisper STT ready), Survey discount checkbox

## Important Notes
- Zadarma completely removed — only Novofon
- All pages use admin client (not supabase with RLS) to avoid 404s
- Incoming calls auto-create contact + lead
- Auto-leads cron scans Telegram + MAX every 10 min
- Cold calls: boolean call_reached, numeric revenue/profit fields need type conversion on import
- Migrations v50-v55 added: company_status, extra phones/emails, user phone/SIP, transcript, survey_discount, sip_login/password
