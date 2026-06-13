// Spotify OAuth via PKCE — roda 100% no navegador, sem client secret.
// Substitui o spotipy/SpotifyOAuth do script original de forma segura.

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SCOPES = "user-read-playback-state user-read-currently-playing";
const TOKEN_KEY = "spotify_token";
const VERIFIER_KEY = "spotify_pkce_verifier";

function redirectUri(): string {
  // A própria página /spotify recebe o callback (?code=...).
  return `${window.location.origin}/spotify`;
}

type StoredToken = {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
};

function randomString(len: number): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => ("0" + b.toString(16)).slice(-2)).join("");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function isConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

export async function login(): Promise<void> {
  const verifier = randomString(64);
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function handleRedirectCallback(): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return false;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) return false;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!res.ok) return false;

  const data = await res.json();
  saveToken(data);
  sessionStorage.removeItem(VERIFIER_KEY);
  // Limpa o ?code da URL.
  window.history.replaceState({}, "", redirectUri());
  return true;
}

function saveToken(data: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}) {
  const token: StoredToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

function readToken(): StoredToken | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  return raw ? (JSON.parse(raw) as StoredToken) : null;
}

async function refresh(token: StoredToken): Promise<StoredToken | null> {
  if (!token.refresh_token) return null;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  // O refresh nem sempre devolve um novo refresh_token.
  if (!data.refresh_token) data.refresh_token = token.refresh_token;
  saveToken(data);
  return readToken();
}

export async function getAccessToken(): Promise<string | null> {
  let token = readToken();
  if (!token) return null;
  if (Date.now() > token.expires_at - 30_000) {
    token = await refresh(token);
  }
  return token?.access_token ?? null;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return readToken() !== null;
}
