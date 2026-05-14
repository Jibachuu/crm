"use client";

import { useState } from "react";

// Backlog v6 §6.1-6.3 — public quote pages (/q/[id]) were rendering bare
// <img> tags. If a Supabase Storage URL hit CORS / network blocking on the
// client side, the broken-image icon showed silently and operators had to
// guess. This wrapper:
//   • renders a placeholder block when the image fails to load
//   • offers a one-click retry (cache-bust via ?_=Date.now())
//   • falls back through /api/image-proxy on the second failure, which
//     bypasses any client-side CORS issue at the cost of proxying the
//     bytes through our server.
//
// Drop-in for <img> — accepts the same style/className and a placeholder
// node to show instead of the retry button when needed.

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  fallback?: React.ReactNode;
};

export default function ImageWithFallback({ src, fallback, style, className, alt = "", ...rest }: Props) {
  const [stage, setStage] = useState<"src" | "proxy" | "broken">("src");
  const [cacheBust, setCacheBust] = useState(0);

  if (!src || stage === "broken") {
    return (
      <>
        {fallback ?? (
          <div
            className={className}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#f1ece4",
              color: "#8c7e6a",
              fontSize: 11,
              textAlign: "center",
              padding: 6,
              ...(style ?? {}),
            }}
          >
            <button
              type="button"
              onClick={() => {
                setStage("src");
                setCacheBust(Date.now());
              }}
              style={{ background: "none", border: "none", color: "#6b5e4f", textDecoration: "underline", cursor: "pointer", fontSize: 11 }}
            >
              Обновить фото
            </button>
          </div>
        )}
      </>
    );
  }

  const finalSrc =
    stage === "proxy"
      ? `/api/image-proxy?url=${encodeURIComponent(String(src))}${cacheBust ? `&_=${cacheBust}` : ""}`
      : cacheBust
        ? `${src}${String(src).includes("?") ? "&" : "?"}_=${cacheBust}`
        : (src as string);

  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      {...rest}
      src={finalSrc}
      alt={alt}
      style={style}
      className={className}
      onError={() => {
        if (stage === "src") setStage("proxy");
        else setStage("broken");
      }}
    />
  );
}
