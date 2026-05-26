// CinemaPi auth + global fetch interceptor.
// Importing this module installs a window.fetch wrapper that:
//  - attaches Authorization: Bearer <token> to all requests to the CinemaPi API
//  - on 401: clears token and redirects to /login

export const CINEMAPI_BASE = "http://192.168.86.136:8000";
export const TOKEN_KEY = "cinemapi_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthed(): boolean {
  return !!getToken();
}

declare global {
  interface Window {
    __cinemapi_fetch_installed?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__cinemapi_fetch_installed) {
  window.__cinemapi_fetch_installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const isCinema = url.startsWith(CINEMAPI_BASE);
    let nextInit = init;
    if (isCinema) {
      const token = getToken();
      if (token) {
        const headers = new Headers(init.headers || {});
        if (!headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        nextInit = { ...init, headers };
      }
    }
    const res = await original(input as RequestInfo, nextInit);
    if (isCinema && res.status === 401) {
      clearToken();
      if (!window.location.pathname.startsWith("/login")) {
        const redirect = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.replace(`/login?redirect=${redirect}`);
      }
    }
    return res;
  };
}
