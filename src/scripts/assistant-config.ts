// Shared configuration for the PoRA study assistant, used by both the chapter
// chat widget (BookAssistant) and the homepage setup guide (SetupGuide). Keeping
// settings + the system prompt here means the key a reader saves on the homepage
// is the same one the chapter chat reads (same origin, same localStorage key).

export type Provider = 'openrouter' | 'anthropic' | 'openai' | 'local';

export interface Settings {
  provider: Provider;
  openrouterModel: string;
  anthropicModel: string;
  openaiModel: string;
  localModel: 'small' | 'balanced' | 'large';
  keys: { openrouter: string; anthropic: string; openai: string };
}

export const STORAGE_KEY = 'pora-assistant-settings';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const OPENAI_BASE = 'https://api.openai.com/v1';

// Default free model. Chosen for its comparatively generous free-tier rate
// limits (NVIDIA-hosted). Free models rotate, so this is also the fallback if
// the live model list can't be fetched.
export const FALLBACK_FREE_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';

export const PROVIDER_LABELS: Record<Provider, string> = {
  openrouter: 'OpenRouter · free models (recommended)',
  anthropic: 'Claude · your API key',
  openai: 'OpenAI · your API key',
  local: 'In your browser · no key, advanced',
};

export interface LocalModel {
  id: string;
  label: string;
  download: string;
  ramGB: number;
}
export const LOCAL_MODELS: Record<Settings['localModel'], LocalModel> = {
  small: { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Small (Llama 3.2 1B)', download: '≈0.9 GB', ramGB: 1 },
  balanced: { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: 'Balanced (Qwen2.5 3B)', download: '≈1.9 GB', ramGB: 3 },
  large: { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', label: 'Large (Qwen2.5 7B)', download: '≈4.3 GB', ramGB: 6 },
};

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openrouter',
  openrouterModel: FALLBACK_FREE_MODEL,
  anthropicModel: 'claude-haiku-4-5',
  openaiModel: 'gpt-5.4-mini',
  localModel: 'balanced',
  keys: { openrouter: '', anthropic: '', openai: '' },
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const s: Settings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      keys: { ...DEFAULT_SETTINGS.keys, ...(parsed.keys || {}) },
    };
    // Settings saved by older versions may reference the removed custom-endpoint
    // provider — fall back to the default rather than a provider we can't serve.
    if (!(s.provider in PROVIDER_LABELS)) s.provider = DEFAULT_SETTINGS.provider;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode / storage disabled — settings just won't persist */
  }
}

// "Configured" = ready to chat without further setup. Local mode has its own
// in-widget WebGPU/consent flow, so it counts as configured; hosted providers
// need a key.
export function isConfigured(s: Settings): boolean {
  if (s.provider === 'local') return true;
  return !!(s.keys[s.provider] && s.keys[s.provider].trim());
}

// ---- OpenRouter one-click connect (OAuth PKCE) ------------------------------
// https://openrouter.ai/docs/use-cases/oauth-pkce — designed for public clients
// with no backend: we redirect to openrouter.ai, the reader approves, and we
// exchange the returned ?code= for an app-scoped API key entirely client-side.
// The reader never sees or pastes a key, and can revoke it from their
// OpenRouter dashboard at any time.

const PKCE_VERIFIER_KEY = 'pora-or-pkce-verifier';

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Save any pending settings, then leave for openrouter.ai. OpenRouter redirects
// back to this same page with ?code=…, which completeOpenRouterConnect() picks up.
export async function startOpenRouterConnect(): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  let challengeParams = '';
  try {
    // The verifier must survive the round-trip to openrouter.ai. If storage is
    // unavailable (strict private mode), use the plain flow instead — a
    // challenge we can no longer answer would make the exchange impossible.
    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    challengeParams = `&code_challenge=${base64url(new Uint8Array(digest))}&code_challenge_method=S256`;
  } catch {
    /* plain flow */
  }
  const callback = `${location.origin}${location.pathname}`;
  location.href = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}${challengeParams}`;
}

// Call on page load. Returns false when the URL carries no OAuth code (the
// common case); on success the key is already saved and the provider switched
// to OpenRouter. Throws with a readable message if the exchange fails.
export async function completeOpenRouterConnect(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (!code) return false;
  // Strip the single-use code from the URL first so a reload/bookmark doesn't
  // retry a spent code.
  params.delete('code');
  const qs = params.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  let verifier: string | null = null;
  try {
    verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  } catch {
    /* ignore */
  }
  const res = await fetch(`${OPENROUTER_BASE}/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      verifier ? { code, code_verifier: verifier, code_challenge_method: 'S256' } : { code }
    ),
  });
  if (!res.ok) {
    throw new Error(`Connecting to OpenRouter failed (${res.status}). Please try again.`);
  }
  const json = await res.json().catch(() => ({}));
  if (!json.key) throw new Error('OpenRouter did not return a key. Please try connecting again.');
  const s = loadSettings();
  s.provider = 'openrouter';
  s.keys.openrouter = json.key;
  saveSettings(s);
  return true;
}

// Fetch the currently-available free models from OpenRouter (public endpoint, no
// auth). Returns [] on failure so callers can fall back to a text field.
export async function fetchOpenRouterFreeModels(): Promise<{ id: string; name: string }[]> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`);
    if (!res.ok) return [];
    const json = await res.json();
    const free = (json.data || []).filter((m: any) => {
      const p = m.pricing || {};
      return Number(p.prompt) === 0 && Number(p.completion) === 0;
    });
    // Rank strong general-purpose instruct/reasoning models first, and push
    // roleplay/"uncensored" community models to the bottom — this list is what
    // seeds the default model, so a sensible study-assistant model wins.
    const TOP = /nvidia\/nemotron-3-nano-30b/i; // generous free rate limits → default
    const PREFER = /nvidia|nemotron|deepseek|qwen|llama|mistral|mixtral|gemini|gemma|glm|phi-|kimi|command/i;
    const AVOID = /uncensored|venice|nsfw|roleplay|rocinante|abliterat|unslop|erosscape|dolphin|hentai|content-safety|guard/i;
    const rank = (id: string) => (TOP.test(id) ? 0 : AVOID.test(id) ? 3 : PREFER.test(id) ? 1 : 2);
    return free
      .map((m: any) => ({ id: m.id as string, name: (m.name as string) || m.id }))
      .sort((a: any, b: any) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}

// The PoRA assistant persona + grounding rules. `excerpt` is chapter text the
// caller has already selected (retrieved passages for local models, the full
// chapter for hosted ones).
export function buildSystemPrompt(chapterTitle: string, excerpt: string): string {
  return (
    `You are the Principles of Robot Autonomy (PoRA) study assistant — a friendly, ` +
    `patient, and rigorous teaching assistant helping a reader understand the textbook ` +
    `while they read it.\n\n` +
    `Your goals, in order:\n` +
    `1. Help the reader genuinely learn — build intuition and explain the "why", don't just ` +
    `hand over answers.\n` +
    `2. Be correct. Robotics and its underlying math are precise; a confident wrong answer ` +
    `is worse than an honest hedge. If you are unsure, say so. Never invent equations, ` +
    `results, citations, or algorithm details.\n\n` +
    `Grounding:\n` +
    `- The reader is on the chapter "${chapterTitle}". Relevant excerpts are provided in ` +
    `<chapter_excerpts> below — treat them as the primary source of truth and prioritize them.\n` +
    `- Prefer answering from the chapter, using the book's definitions, notation, and conventions.\n` +
    `- Math in the excerpts is LaTeX. Numbered display equations appear as ` +
    `"Equation (N.M) : $...$" — when the reader mentions an equation by number (e.g. "Eq. 18.1"), ` +
    `find that exact tag in the excerpts and answer about that equation only.\n` +
    `- If something isn't in the excerpts but you know it reliably from robotics fundamentals, ` +
    `you may add it — but clearly mark it as background beyond this chapter (e.g. "Beyond what ` +
    `this chapter covers: …").\n` +
    `- If a question is outside the book and your reliable knowledge, say you're not sure rather ` +
    `than guessing, and suggest where in the book it might be covered.\n\n` +
    `Style:\n` +
    `- Friendly and encouraging; concise first, then offer to go deeper.\n` +
    `- Pedagogical: explain step by step, give a small example or intuition, and where useful ` +
    `end with a brief check-for-understanding question or a suggested next step.\n` +
    `- Define jargon the first time you use it; match the reader's level.\n` +
    `- Stay on robot autonomy and this book; politely redirect unrelated questions.\n\n` +
    `Formatting:\n` +
    `- Write in Markdown; use headings/lists/bold only when they aid clarity.\n` +
    `- Write ALL mathematics in LaTeX: inline as $...$ and display as $$...$$, using the ` +
    `book's symbols.\n` +
    `- Use fenced code blocks for code.\n\n` +
    `<chapter_excerpts>\n${excerpt}\n</chapter_excerpts>`
  );
}
