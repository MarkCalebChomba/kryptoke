/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "kryptoke",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "ap-south-1", // Stay in same region as existing Lambda
        },
      },
    };
  },

  async run() {
    // ── Upstash Redis (already exists, just pass the URL via env) ─────────

    // ── Secrets ───────────────────────────────────────────────────────────
    const jwtSecret = new sst.Secret("JwtSecret");
    const supabaseServiceKey = new sst.Secret("SupabaseServiceKey");
    const mpesaConsumerKey = new sst.Secret("MpesaConsumerKey");
    const mpesaConsumerSecret = new sst.Secret("MpesaConsumerSecret");
    const mpesaPasskey = new sst.Secret("MpesaPasskey");
    const mpesaB2cInitiatorPass = new sst.Secret("MpesaB2cInitiatorPass");
    const africasTalkingApiKey = new sst.Secret("AfricasTalkingApiKey");
    const resendApiKey = new sst.Secret("ResendApiKey");
    const hotWalletKey = new sst.Secret("HotWalletKey");
    const sweepSecret = new sst.Secret("SweepSecret");
    const binanceApiKey = new sst.Secret("BinanceApiKey");
    const binanceApiSecret = new sst.Secret("BinanceApiSecret");
    const sentryDsn = new sst.Secret("SentryDsn");
    const upstashRedisUrl = new sst.Secret("UpstashRedisUrl");
    const upstashRedisToken = new sst.Secret("UpstashRedisToken");

    // ── Hono API Lambda ────────────────────────────────────────────────────
    const api = new sst.aws.Function("KryptoKeApi", {
      handler: "server/lambda.handler",
      runtime: "nodejs20.x",
      memory: "512 MB",
      timeout: "30 seconds",
      url: true,
      // Provisioned concurrency in production to eliminate cold starts
      ...$app.stage === "production" && {
        reservedConcurrentExecutions: 10,
      },
      environment: {
        NODE_ENV: $app.stage === "production" ? "production" : "development",
        NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
        JWT_SECRET: jwtSecret.value,
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey.value,
        MPESA_CONSUMER_KEY: mpesaConsumerKey.value,
        MPESA_CONSUMER_SECRET: mpesaConsumerSecret.value,
        MPESA_PASSKEY: mpesaPasskey.value,
        MPESA_B2C_INITIATOR_PASSWORD: mpesaB2cInitiatorPass.value,
        MPESA_PAYBILL: process.env["MPESA_PAYBILL"] ?? "",
        MPESA_B2C_SHORTCODE: process.env["MPESA_B2C_SHORTCODE"] ?? "",
        MPESA_CALLBACK_BASE_URL:
          $app.stage === "production"
            ? "https://api.kryptoke.com"
            : process.env["MPESA_CALLBACK_BASE_URL"] ?? "",
        AFRICASTALKING_USERNAME: process.env["AFRICASTALKING_USERNAME"] ?? "",
        AFRICASTALKING_API_KEY: africasTalkingApiKey.value,
        RESEND_API_KEY: resendApiKey.value,
        RESEND_FROM_EMAIL: "noreply@kryptoke.com",
        BINANCE_API_KEY: binanceApiKey.value,
        BINANCE_API_SECRET: binanceApiSecret.value,
        UPSTASH_REDIS_REST_URL: upstashRedisUrl.value,
        UPSTASH_REDIS_REST_TOKEN: upstashRedisToken.value,
        SENTRY_DSN: sentryDsn.value,
        MASTER_SEED_PHRASE: process.env["MASTER_SEED_PHRASE"] ?? "",
        HOT_WALLET_ADDRESS: process.env["HOT_WALLET_ADDRESS"] ?? "",
        // HOT_WALLET_KEY is NOT exposed here — only to the sweep EventBridge job below
        BSC_RPC_URL: process.env["BSC_RPC_URL"] ?? "https://bsc-dataseed.binance.org",
        BSCSCAN_API_KEY: process.env["BSCSCAN_API_KEY"] ?? "",
        ADMIN_EMAIL: process.env["ADMIN_EMAIL"] ?? "",
        CORS_ORIGIN:
          $app.stage === "production"
            ? "https://kryptoke.com"
            : "http://localhost:3000",
      },
    });

    // ── Sweep Job — EventBridge only, NOT HTTP-accessible ──────────────────
    // This is the fix for Bug #8: HOT_WALLET_KEY must never be on HTTP Lambda
    const sweepJob = new sst.aws.Function("KryptoKeSweep", {
      handler: "server/jobs/sweep.handler",
      runtime: "nodejs20.x",
      memory: "256 MB",
      timeout: "5 minutes",
      environment: {
        NODE_ENV: $app.stage === "production" ? "production" : "development",
        NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey.value,
        MASTER_SEED_PHRASE: process.env["MASTER_SEED_PHRASE"] ?? "",
        HOT_WALLET_KEY: hotWalletKey.value, // Only here — never on HTTP Lambda
        HOT_WALLET_ADDRESS: process.env["HOT_WALLET_ADDRESS"] ?? "",
        BSC_RPC_URL: process.env["BSC_RPC_URL"] ?? "https://bsc-dataseed.binance.org",
        UPSTASH_REDIS_REST_URL: upstashRedisUrl.value,
        UPSTASH_REDIS_REST_TOKEN: upstashRedisToken.value,
      },
    });

    // EventBridge schedule — runs sweep every hour
    new sst.aws.Cron("SweepCron", {
      schedule: "rate(1 hour)",
      job: sweepJob.arn,
    });

    // ── Anomaly Detection Job — runs every minute ─────────────────────────
    const anomalyJob = new sst.aws.Function("KryptoKeAnomalyDetector", {
      handler: "server/jobs/anomaly.handler",
      runtime: "nodejs20.x",
      memory: "256 MB",
      timeout: "2 minutes",
      environment: {
        NODE_ENV: $app.stage === "production" ? "production" : "development",
        NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey.value,
        RESEND_API_KEY: resendApiKey.value,
        ADMIN_EMAIL: process.env["ADMIN_EMAIL"] ?? "",
      },
    });

    new sst.aws.Cron("AnomalyCron", {
      schedule: "rate(1 minute)",
      job: anomalyJob.arn,
    });

    // ── Portfolio Snapshot Job — runs daily at midnight EAT ────────────────
    const portfolioJob = new sst.aws.Function("KryptoKePortfolioSnapshot", {
      handler: "server/jobs/portfolio-snapshot.handler",
      runtime: "nodejs20.x",
      memory: "256 MB",
      timeout: "5 minutes",
      environment: {
        NODE_ENV: $app.stage === "production" ? "production" : "development",
        NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey.value,
        UPSTASH_REDIS_REST_URL: upstashRedisUrl.value,
        UPSTASH_REDIS_REST_TOKEN: upstashRedisToken.value,
      },
    });

    // 21:00 UTC = midnight EAT (East Africa Time = UTC+3)
    new sst.aws.Cron("PortfolioSnapshotCron", {
      schedule: "cron(0 21 * * ? *)",
      job: portfolioJob.arn,
    });

    // ── B2C Timeout Recovery Job — runs every 10 minutes ─────────────────
    // Fix for Bug #7: withdrawals stuck in processing state
    const b2cRecoveryJob = new sst.aws.Function("KryptoKeB2cRecovery", {
      handler: "server/jobs/b2c-recovery.handler",
      runtime: "nodejs20.x",
      memory: "128 MB",
      timeout: "2 minutes",
      environment: {
        NODE_ENV: $app.stage === "production" ? "production" : "development",
        NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "",
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey.value,
        MPESA_CONSUMER_KEY: mpesaConsumerKey.value,
        MPESA_CONSUMER_SECRET: mpesaConsumerSecret.value,
        UPSTASH_REDIS_REST_URL: upstashRedisUrl.value,
        UPSTASH_REDIS_REST_TOKEN: upstashRedisToken.value,
      },
    });

    new sst.aws.Cron("B2cRecoveryCron", {
      schedule: "rate(10 minutes)",
      job: b2cRecoveryJob.arn,
    });

    return {
      ApiUrl: api.url,
      SweepFunctionArn: sweepJob.arn,
    };
  },
});
