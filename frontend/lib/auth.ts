const ACCESS_TOKEN_KEY = "litopc_access_token_v1";
const LEGACY_ACCESS_TOKEN_KEY = "opclab_access_token_v1";
const DEV_USER_ID_KEY = "litopc_user_id_v1";
const LEGACY_DEV_USER_ID_KEY = "opclab_user_id_v1";
const DEV_EMAIL_KEY = "litopc_email_v1";
const LEGACY_DEV_EMAIL_KEY = "opclab_email_v1";

function getFirstLocalStorageValue(...keys: string[]): string | null {
  if (typeof window === "undefined") return null;
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }
  return null;
}

export function getAccessToken(): string | null {
  const raw = getFirstLocalStorageValue(ACCESS_TOKEN_KEY, LEGACY_ACCESS_TOKEN_KEY);
  if (!raw) return null;
  const token = raw.trim();
  return token.length > 0 ? token : null;
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  const value = token.trim();
  if (!value) {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(ACCESS_TOKEN_KEY, value);
}

export function getDevUserId(): string | null {
  const raw = getFirstLocalStorageValue(DEV_USER_ID_KEY, LEGACY_DEV_USER_ID_KEY);
  if (!raw) return null;
  const userId = raw.trim();
  return userId.length > 0 ? userId : null;
}

export function setDevUserId(userId: string): void {
  if (typeof window === "undefined") return;
  const value = userId.trim();
  if (!value) {
    window.localStorage.removeItem(DEV_USER_ID_KEY);
    return;
  }
  window.localStorage.setItem(DEV_USER_ID_KEY, value);
}

export function getDevEmail(): string | null {
  const raw = getFirstLocalStorageValue(DEV_EMAIL_KEY, LEGACY_DEV_EMAIL_KEY);
  if (!raw) return null;
  const email = raw.trim();
  return email.length > 0 ? email : null;
}

export function setDevEmail(email: string): void {
  if (typeof window === "undefined") return;
  const value = email.trim();
  if (!value) {
    window.localStorage.removeItem(DEV_EMAIL_KEY);
    return;
  }
  window.localStorage.setItem(DEV_EMAIL_KEY, value);
}
