import type { Metric } from "web-vitals";

const ENDPOINT = "/api/v1/metrics/web-vitals";

/**
 * Reports a single Web Vitals metric to the backend.
 * Called from Next.js built-in reportWebVitals export.
 * Non-blocking — never throws.
 */
export function reportWebVital(metric: Metric): void {
  const body = JSON.stringify({
    metric: metric.name,
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    route: window.location.pathname,
  });

  // Use sendBeacon when available (non-blocking, survives page unload)
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(ENDPOINT, blob);
    return;
  }

  // Fallback to fetch
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Track a custom performance mark.
 * Used for chart load time, balance update latency, etc.
 */
export function trackTiming(name: string, durationMs: number): void {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    metric: name,
    value: Math.round(durationMs),
    route: window.location.pathname,
  });

  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Performance mark helper — returns a function that, when called,
 * reports the elapsed time since the mark was created.
 */
export function createMark(name: string): () => void {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    trackTiming(name, duration);
  };
}
