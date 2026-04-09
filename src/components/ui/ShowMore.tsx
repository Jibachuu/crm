"use client";

import { ChevronDown } from "lucide-react";

interface ShowMoreProps {
  hasMore: boolean;
  remaining: number;
  total: number;
  visibleCount: number;
  onShowMore: () => void;
  onShowAll: () => void;
}

export default function ShowMore({ hasMore, remaining, total, visibleCount, onShowMore, onShowAll }: ShowMoreProps) {
  if (!hasMore) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-3 mt-2">
      <button
        onClick={onShowMore}
        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors hover:bg-blue-50"
        style={{ color: "#0067a5", border: "1px solid #d0e8f5" }}
      >
        <ChevronDown size={14} />
        Показать ещё {Math.min(remaining, 40)}
      </button>
      {remaining > 40 && (
        <button
          onClick={onShowAll}
          className="text-xs hover:underline"
          style={{ color: "#888" }}
        >
          Все ({total})
        </button>
      )}
      <span className="text-xs" style={{ color: "#bbb" }}>
        {visibleCount} из {total}
      </span>
    </div>
  );
}
