"use client";

import { useState } from "react";

export default function AnalyticsTabs({ dashboard, datasets }: { dashboard: React.ReactNode; datasets: React.ReactNode }) {
  const [tab, setTab] = useState<"dashboard" | "datasets">("dashboard");

  return (
    <div>
      <div className="flex mb-5" style={{ borderBottom: "1px solid #e4e4e4" }}>
        {[
          { key: "dashboard", label: "Дашборд" },
          { key: "datasets", label: "Data Sets" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className="px-5 py-2.5 text-sm font-medium transition-colors"
            style={{
              borderBottom: tab === t.key ? "2px solid #0067a5" : "2px solid transparent",
              color: tab === t.key ? "#0067a5" : "#666",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" ? dashboard : datasets}
    </div>
  );
}
