import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
const CUSTOM_URL_KEY = 'custom_api_url';

function normalizeApiUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function getCandidateUrls(customUrl?: string | null): string[] {
  const list: string[] = [];
  const push = (u?: string | null) => {
    if (!u) return;
    const n = normalizeApiUrl(u);
    if (n && !list.includes(n)) list.push(n);
  };

  push(customUrl);
  push(process.env.EXPO_PUBLIC_API_URL);
  push('https://uygulama-deneme-1.onrender.com/api');

  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host && /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    push(`http://${host}:4000/api`);
  }

  const extraDefault = (Constants.expoConfig?.extra as { defaultApiUrl?: string } | undefined)?.defaultApiUrl;
  push(extraDefault);
  push('http://192.168.1.31:4000/api');
  push('http://localhost:4000/api');

  return list;
}

let customApiUrl: string | null = null;
let activeApiUrl: string = getCandidateUrls()[0] ?? 'http://192.168.1.31:4000/api';
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  constructor(message: string, public status: number, public data?: any) {
    super(message);
  }
}

export function getApiUrl(): string {
  return activeApiUrl;
}

export function getCustomApiUrl(): string | null {
  return customApiUrl;
}

export async function setCustomApiUrl(url: string | null): Promise<string> {
  const cleaned = url?.trim() ? normalizeApiUrl(url) : null;
  customApiUrl = cleaned;
  if (cleaned) {
    await SecureStore.setItemAsync(CUSTOM_URL_KEY, cleaned);
    activeApiUrl = cleaned;
  } else {
    await SecureStore.deleteItemAsync(CUSTOM_URL_KEY);
    activeApiUrl = getCandidateUrls(null)[0] ?? 'http://192.168.1.31:4000/api';
  }
  return activeApiUrl;
}

async function checkHealth(baseUrl: string, timeoutMs = 3000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/health`, {
      signal: ctrl.signal,
      headers: { 'Bypass-Tunnel-Reminder': 'true' },
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return Boolean(json?.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Aday sunucu adreslerini sırayla test edip çalışan ilk adresi seçer */
export async function probeBestApiUrl(): Promise<{ ok: boolean; url: string }> {
  const storedCustom = await SecureStore.getItemAsync(CUSTOM_URL_KEY).catch(() => null);
  if (storedCustom) customApiUrl = storedCustom;

  const candidates = getCandidateUrls(customApiUrl);
  for (const candidate of candidates) {
    if (await checkHealth(candidate, 2800)) {
      activeApiUrl = candidate;
      return { ok: true, url: candidate };
    }
  }
  activeApiUrl = candidates[0] ?? activeApiUrl;
  return { ok: false, url: activeApiUrl };
}

export async function loadStoredToken(): Promise<string | null> {
  await probeBestApiUrl();
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function setToken(t: string | null): Promise<void> {
  token = t;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
}

export async function api<T>(path: string, { method = 'GET', body, query }: Options = {}): Promise<T> {
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';

  const doFetch = (base: string) =>
    fetch(`${base}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Bypass-Tunnel-Reminder': 'true',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let res: Response;
  try {
    res = await doFetch(activeApiUrl);
  } catch {
    // İlk bağlantı başarısızsa yedek sunucu adreslerini dene
    const probed = await probeBestApiUrl();
    if (!probed.ok) {
      throw new ApiError(
        `Sunucuya ulaşılamadı (${activeApiUrl}). Telefon ile bilgisayar aynı Wi-Fi ağında olmalı veya tünel adresi girilmeli.`,
        0,
      );
    }
    try {
      res = await doFetch(probed.url);
    } catch {
      throw new ApiError(`Sunucuya ulaşılamadı (${probed.url}).`, 0);
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError((data as { error?: string }).error ?? `Hata (${res.status})`, res.status, data);
  }
  return data as T;
}
