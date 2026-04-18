import { handle } from "hono/vercel";
import app from "@/server/index";

export const runtime = "nodejs";
export const maxDuration = 30; // Cap all API routes at 30s — prevents runaway functions

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
