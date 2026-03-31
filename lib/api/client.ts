import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import type { ApiResponse } from "@/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3000/api/v1"
    : "https://kryptoke-mu.vercel.app/api/v1");

/* ─── Axios Instance ────────────────────────────────────────────────────── */

const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/* ─── Token Storage Helpers ─────────────────────────────────────────────── */

// Split token across two keys — neither alone is useful to an attacker
const _K1 = "_kk_s1";
const _K2 = "_kk_s2";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const a = localStorage.getItem(_K1);
  const b = localStorage.getItem(_K2);
  if (!a || !b) return null;
  // Reassemble: first half + second half
  return a + b;
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return;
  const mid = Math.ceil(token.length / 2);
  localStorage.setItem(_K1, token.slice(0, mid));
  localStorage.setItem(_K2, token.slice(mid));
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(_K1);
  localStorage.removeItem(_K2);
}

/* ─── Request Interceptor — attach JWT ──────────────────────────────────── */

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = getStoredToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

/* ─── Response Interceptor — handle 401, normalize errors ──────────────── */

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      // 401 — token expired or invalid, clear and redirect to login
      if (status === 401) {
        clearStoredToken();
        if (typeof window !== "undefined") {
          window.location.href = "/auth/login";
        }
        return Promise.reject(
          new ApiClientError("Session expired. Please log in again.", 401)
        );
      }

      // 503 — maintenance mode
      if (status === 503) {
        return Promise.reject(
          new ApiClientError("KryptoKe is currently under maintenance. Please try again shortly.", 503)
        );
      }

      // Extract error message from API response body, sanitized for user display
      const data = error.response?.data as { error?: string } | undefined;
      const rawMessage = data?.error ?? "";

      // Sanitize: never expose database errors, stack traces, or internal paths to users
      const isTechnical = /PGRST|prisma|supabase|TypeError:|SyntaxError:|ReferenceError:|at Object\.|at Function\.|\n    at |node_modules|Cannot read prop/i.test(rawMessage);
      const message = isTechnical
        ? "Something went wrong. Please try again."
        : rawMessage || "Something went wrong. Please try again.";

      return Promise.reject(new ApiClientError(message, status ?? 0));
    }

    return Promise.reject(error);
  }
);

/* ─── Custom Error Class ────────────────────────────────────────────────── */

export class ApiClientError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
  }
}

/* ─── Typed Request Helpers ─────────────────────────────────────────────── */

export async function apiGet<T>(
  path: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await apiClient.get<ApiResponse<T>>(path, config);
  const body = response.data;
  if (!body.success) {
    throw new ApiClientError(body.error, body.statusCode);
  }
  return body.data;
}

export async function apiPost<T>(
  path: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await apiClient.post<ApiResponse<T>>(path, data, config);
  const body = response.data;
  if (!body.success) {
    throw new ApiClientError(body.error, body.statusCode);
  }
  return body.data;
}

export async function apiPatch<T>(
  path: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await apiClient.patch<ApiResponse<T>>(path, data, config);
  const body = response.data;
  if (!body.success) {
    throw new ApiClientError(body.error, body.statusCode);
  }
  return body.data;
}

export async function apiDelete<T>(
  path: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const response = await apiClient.delete<ApiResponse<T>>(path, config);
  const body = response.data;
  if (!body.success) {
    throw new ApiClientError(body.error, body.statusCode);
  }
  return body.data;
}

export { apiClient };
