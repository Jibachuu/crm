import { useState, useMemo } from "react";

const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;

export function usePagination<T>(items: T[], defaultSize = 40) {
  const [visibleCount, setVisibleCount] = useState(defaultSize);

  const visible = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;
  const remaining = items.length - visibleCount;

  function showMore(count?: number) {
    setVisibleCount((prev) => Math.min(prev + (count ?? defaultSize), items.length));
  }

  function showAll() {
    setVisibleCount(items.length);
  }

  function reset() {
    setVisibleCount(defaultSize);
  }

  return { visible, hasMore, remaining, total: items.length, visibleCount, showMore, showAll, reset, PAGE_SIZE_OPTIONS };
}
