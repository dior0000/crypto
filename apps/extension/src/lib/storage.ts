export interface StoredAuth {
  token: string;
  apiBaseUrl: string;
}

const STORAGE_KEY = "chartmate_auth";

export async function getStoredAuth(): Promise<StoredAuth | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as StoredAuth | undefined) ?? null;
}

export async function setStoredAuth(auth: StoredAuth): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: auth });
}

export async function clearStoredAuth(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

const ONBOARDING_SEEN_KEY = "chartmate_onboarding_seen";

export async function getOnboardingSeen(): Promise<boolean> {
  const result = await chrome.storage.local.get(ONBOARDING_SEEN_KEY);
  return Boolean(result[ONBOARDING_SEEN_KEY]);
}

export async function setOnboardingSeen(): Promise<void> {
  await chrome.storage.local.set({ [ONBOARDING_SEEN_KEY]: true });
}
