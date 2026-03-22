"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#080C14",
          color: "#F0F4FF",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          margin: 0,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "rgba(255,69,96,0.1)",
            border: "1px solid rgba(255,69,96,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            lineHeight: 1,
          }}
        >
          !
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: 14, color: "#8A9CC0", margin: 0, maxWidth: 300, lineHeight: 1.6 }}>
          An unexpected error occurred. Our team has been notified automatically.
        </p>
        <button
          onClick={reset}
          style={{
            background: "#00E5B4",
            color: "#080C14",
            border: "none",
            borderRadius: 12,
            padding: "12px 32px",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
