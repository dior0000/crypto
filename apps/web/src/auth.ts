const TOKEN_STORAGE_KEY = "chartmate_token";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Ошибка ${response.status}`;
  } catch {
    return `Ошибка ${response.status}`;
  }
}

export async function register(email: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function login(email: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  const { accessToken } = (await response.json()) as { accessToken: string };
  localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
}
