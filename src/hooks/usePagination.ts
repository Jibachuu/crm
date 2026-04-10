import { useState, useMemo, useCallback } from "react";

const PAGE_SIZE_OPTIONS = [30, 50, 100] as const;

export function usePagination<T>(items: T[], defaultSize = 40) {
  const [visibleCount, setVisibleCount] = useState(defaultSize);

  // slice handles overflow gracefully — visibleCount can be > items.length safely
  const visible = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  const hasMore = visibleCount < items.length;
  const remaining = Math.max(0, items.length - visibleCount);

  // Don't clamp here — let slice() handle overflow. Clamping with stale items.length
  // can leave visibleCount stuck (the original "пусто после клика" bug).
  const showMore = useCallback((count?: number) => {
    setVisibleCount((prev) => prev + (count ?? defaultSize));
  }, [defaultSize]);

  const showAll = useCallback(() => {
    setVisibleCount(Number.MAX_SAFE_INTEGER);
  }, []);

  const reset = useCallback(() => {
    setVisibleCount(defaultSize);
  }, [defaultSize]);

  return { visible, hasMore, remaining, total: items.length, visibleCount, showMore, showAll, reset, PAGE_SIZE_OPTIONS };
}
