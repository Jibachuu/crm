"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Trash2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AIChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка API");
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.reply }]);
      }
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }

  function clearChat() {
    setMessages([]);
    setError("");
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110"
          style={{ background: "linear-gradient(135deg, #0067a5, #5b57d1)", color: "#fff" }}
          title="ИИ-ассистент"
        >
          <Bot size={22} />
        </button>
      )}

      {/* Side panel */}
      {open && (
        <div className="fixed top-0 right-0 z-50 h-full flex flex-col shadow-2xl"
          style={{ width: 380, background: "#fff", borderLeft: "1px solid #e4e4e4" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "linear-gradient(135deg, #0067a5, #5b57d1)" }}>
            <div className="flex items-center gap-2">
              <Bot size={18} style={{ color: "#fff" }} />
              <span className="text-sm font-semibold text-white">ИИ-ассистент</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearChat} className="p-1.5 rounded hover:bg-white/20" title="Очистить"><Trash2 size={14} style={{ color: "#fff" }} /></button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-white/20"><X size={16} style={{ color: "#fff" }} /></button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ background: "#f8f9fa" }}>
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Bot size={36} className="mx-auto mb-2" style={{ color: "#ddd" }} />
                <p className="text-xs" style={{ color: "#aaa" }}>Задайте вопрос о данных CRM</p>
                <div className="mt-3 space-y-1.5">
                  {["Сколько сделок закрыто за месяц?", "Кто лучший менеджер по выручке?", "Топ-5 товаров по продажам"].map((q) => (
                    <button key={q} onClick={() => { setInput(q); }} className="block w-full text-xs text-left px-3 py-2 rounded hover:bg-blue-50 transition-colors"
                      style={{ border: "1px solid #e4e4e4", color: "#0067a5" }}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className="flex" style={{ justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%", padding: "8px 12px", borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                  background: msg.role === "user" ? "#0067a5" : "#fff", color: msg.role === "user" ? "#fff" : "#333",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)", fontSize: 13, lineHeight: 1.5,
                }}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-xs" style={{ color: "#888" }}>ИИ думает...</span>
              </div>
            )}
            {error && (
              <div className="px-3 py-2 rounded text-xs" style={{ background: "#fdecea", color: "#c62828" }}>{error}</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid #e4e4e4" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Спросите что-нибудь..."
              disabled={loading}
              className="flex-1 text-sm px-3 py-2 rounded-full focus:outline-none"
              style={{ border: "1px solid #e0e0e0", background: "#f5f5f5" }} />
            <button onClick={send} disabled={!input.trim() || loading}
              className="p-2 rounded-full transition-colors disabled:opacity-40" style={{ background: "#0067a5" }}>
              <Send size={14} style={{ color: "#fff" }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
