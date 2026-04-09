const http = require("http");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const PORT = 3200;
const API_KEY = process.env.API_KEY || "artevo-tg-auth-2026";
const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || "";

let client = null;
let phoneCodeHash = "";
let currentPhone = "";

const srv = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }
  if (req.headers.authorization !== API_KEY) { res.writeHead(401); res.end('{"error":"Unauthorized"}'); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ configured: !!(API_ID && API_HASH), hasClient: !!client, phone: currentPhone }));
    return;
  }

  if (url.pathname === "/send-code" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { phone } = JSON.parse(body);
        if (!phone) { res.writeHead(400); res.end('{"error":"phone required"}'); return; }
        if (!API_ID || !API_HASH) { res.writeHead(503); res.end('{"error":"TELEGRAM_API_ID/HASH not set"}'); return; }

        currentPhone = phone;
        const session = new StringSession("");
        client = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 3 });
        await client.connect();
        const result = await client.sendCode({ apiId: API_ID, apiHash: API_HASH }, phone);
        phoneCodeHash = result.phoneCodeHash;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, status: "code_sent" }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (url.pathname === "/verify-code" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { code, password } = JSON.parse(body);
        if (!client) { res.writeHead(400); res.end('{"error":"No client, send code first"}'); return; }

        try {
          await client.invoke(new Api.auth.SignIn({
            phoneNumber: currentPhone,
            phoneCodeHash: phoneCodeHash,
            phoneCode: code,
          }));
        } catch (e) {
          if (e.message?.includes("SESSION_PASSWORD_NEEDED")) {
            if (!password) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ status: "need_password" }));
              return;
            }
            await client.invoke(new Api.auth.CheckPassword({
              password: await client.computeCheck(await client.invoke(new Api.account.GetPassword()), password),
            }));
          } else {
            throw e;
          }
        }

        const sessionStr = client.session.save();
        const me = await client.getMe();
        await client.disconnect();
        client = null;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "authorized",
          session: sessionStr,
          user: { firstName: me.firstName, phone: me.phone },
        }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('{"error":"Not found"}');
});

srv.listen(PORT, () => console.log(`[TG Auth] Port ${PORT}`));
