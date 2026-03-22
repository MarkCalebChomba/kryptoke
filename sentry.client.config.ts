import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  debug: false,
  beforeSend(event) {
    if (event.request?.data) {
      const data = event.request.data as Record<string, unknown>;
      ["password", "assetPin", "currentPin", "pin", "privateKey", "mnemonic"].forEach(
        (key) => { if (key in data) data[key] = "[Filtered]"; }
      );
    }
    return event;
  },
});
