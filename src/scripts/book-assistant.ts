// Client logic for the "Ask this chapter" assistant.
//
// Default engine is a free hosted model via OpenRouter (the reader's own free
// key, so the site stays static + zero-cost). Readers can also use Claude /
// OpenAI / a custom endpoint, or run an open-weight model fully in-browser via
// WebLLM. Context comes from the chapter already on the page (`.chapter-main
// .ltx_document`); the model's answer is rendered as Markdown + LaTeX (KaTeX).

import {
  type Provider,
  type Settings,
  type LocalModel,
  LOCAL_MODELS,
  OPENROUTER_BASE,
  OPENAI_BASE,
  loadSettings,
  saveSettings,
  isConfigured,
  fetchOpenRouterFreeModels,
  buildSystemPrompt,
} from './assistant-config';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const STOPWORDS = new Set(
  'a an the of to in on for and or but is are was were be been being this that these those with as at by from it its into we you they he she i our your their can may might will would should could do does did not no if then else so such than there here what which who whom whose how why when where'.split(
    ' '
  )
);

// Authoritative WebGPU probe: an adapter must actually be obtainable.
async function pickAdapter(): Promise<unknown | null> {
  try {
    const gpu = (navigator as any).gpu;
    if (!gpu) return null;
    return await gpu.requestAdapter();
  } catch {
    return null;
  }
}

// ---- Chapter context ------------------------------------------------------

function extractPassages(): string[] {
  const src = document.querySelector('.chapter-main .ltx_document');
  if (!src) return [];
  // Work on a clone with every MathML island swapped for its original LaTeX
  // (LaTeXML keeps it in the alttext attribute). The textContent of raw MathML
  // is an unreadable symbol soup, and display equations weren't extracted at
  // all — so the model used to guess at what "Eq. (18.1)" actually says.
  const root = src.cloneNode(true) as HTMLElement;
  root.querySelectorAll('math').forEach((m) => {
    // Strip LaTeXML's "%\n" line-continuations — a bare % would comment out
    // the rest of the formula if the model quotes it back.
    const tex = (m.getAttribute('alttext') || m.textContent || '').replace(/%\r?\n\s*/g, '');
    m.replaceWith(` $${tex}$ `);
  });
  const out: string[] = [];
  const nodes = root.querySelectorAll(
    'p.ltx_p, .ltx_equationgroup, .ltx_equation, figcaption, ' +
      '.ltx_title_section, .ltx_title_subsection, .ltx_title_subsubsection'
  );
  nodes.forEach((n) => {
    if (n.matches('.ltx_equation, .ltx_equationgroup')) {
      // Rows of an align-group are already covered by the group itself.
      if (!n.classList.contains('ltx_equationgroup') && n.closest('.ltx_equationgroup')) return;
      const tags = Array.from(n.querySelectorAll('.ltx_tag_equation'), (t) =>
        (t.textContent || '').trim()
      ).filter(Boolean);
      n.querySelectorAll('.ltx_tag').forEach((t) => t.remove());
      const body = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (body) out.push(`Equation ${tags.length ? tags.join(', ') + ' ' : ''}: ${body}`);
    } else {
      const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length >= 40) out.push(text);
    }
  });
  return out;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9.]+/) // keep dots so "18.1" survives as one token
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => (t.length > 2 || /\d/.test(t)) && !STOPWORDS.has(t));
}

// Compact BM25: score every passage against the question.
function bm25Scores(question: string, passages: string[]): number[] {
  const docs = passages.map(tokenize);
  const N = docs.length;
  const avgdl = docs.reduce((a, d) => a + d.length, 0) / N || 1;
  const df = new Map<string, number>();
  docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  const qTerms = new Set(tokenize(question));
  const k1 = 1.5;
  const b = 0.75;
  return docs.map((d) => {
    const tf = new Map<string, number>();
    d.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    let score = 0;
    qTerms.forEach((t) => {
      const f = tf.get(t);
      if (!f) return;
      const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.length / avgdl))));
    });
    return score;
  });
}

function retrieve(question: string, passages: string[], k: number): string[] {
  if (passages.length <= k) return passages;
  const scores = bm25Scores(question, passages);
  const order = passages.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const top = order.slice(0, k).filter((i) => scores[i] > 0);
  const chosen = (top.length ? top : order.slice(0, k)).sort((a, b) => a - b);
  return chosen.map((i) => passages[i]);
}

// Hosted models get the whole chapter when it fits the budget. When it
// doesn't, never truncate blindly (that silently drops the back half of the
// chapter, equations included): keep every equation and drop the least
// question-relevant prose, preserving document order.
function packExcerpt(question: string, passages: string[], budget: number): string {
  let total = passages.reduce((a, p) => a + p.length + 2, 0);
  if (total <= budget) return passages.join('\n\n');
  const scores = bm25Scores(question, passages);
  const keep = passages.map(() => true);
  const droppable = passages
    .map((_, i) => i)
    .filter((i) => !passages[i].startsWith('Equation '))
    .sort((a, b) => scores[a] - scores[b]);
  for (const i of droppable) {
    if (total <= budget) break;
    keep[i] = false;
    total -= passages[i].length + 2;
  }
  const joined = passages.filter((_, i) => keep[i]).join('\n\n');
  return joined.length > budget ? joined.slice(0, budget) : joined;
}

function buildContext(question: string, provider: Provider, chapterTitle: string): string {
  const passages = extractPassages();
  const excerpt =
    provider === 'local'
      ? retrieve(question, passages, 6).join('\n\n').slice(0, 4500)
      : packExcerpt(question, passages, 80000);
  return buildSystemPrompt(chapterTitle, excerpt);
}

// ---- Markdown + math rendering (lazy) -------------------------------------

let mdLibs: { marked: any; DOMPurify: any; katex: any } | null = null;
export async function loadMdLibs() {
  if (mdLibs) return mdLibs;
  const [markedMod, purifyMod, katexMod] = await Promise.all([
    import('marked'),
    import('dompurify'),
    import('katex'),
    import('katex/dist/katex.min.css'),
  ]);
  mdLibs = {
    marked: markedMod.marked,
    DOMPurify: (purifyMod as any).default,
    katex: (katexMod as any).default,
  };
  return mdLibs;
}

// Pull math spans out BEFORE Markdown runs — otherwise Markdown treats "\[",
// "\(", "\," etc. as backslash escapes and destroys the LaTeX (that's why
// "\[ … \]" was showing up as "[ … ]"). We swap each math span for an inert
// placeholder, run + sanitize Markdown, then re-insert KaTeX-rendered HTML.
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)([^$\n]+?)(?<!\s)\$/g;

// KaTeX positions \tag{...} absolutely at the right edge of the display line,
// which overlaps the equation body in a panel this narrow. Detach each tag and
// re-append it as flowing math so it wraps/scrolls with the equation instead.
function detachTags(src: string): string {
  for (let guard = 0; guard < 4; guard++) {
    const m = /\\tag(\*?)\s*\{/.exec(src);
    if (!m) return src;
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let j = open;
    for (; j < src.length; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    if (j >= src.length) return src; // unbalanced (mid-stream) — leave as is
    const label = src.slice(open + 1, j);
    const shown = m[1] ? label : `(${label})`;
    src = `${src.slice(0, m.index)}${src.slice(j + 1)} \\qquad \\text{${shown}}`;
  }
  return src;
}

async function renderRich(el: HTMLElement, text: string) {
  try {
    const { marked, DOMPurify, katex } = await loadMdLibs();
    const store: { content: string; display: boolean }[] = [];
    const guarded = text.replace(MATH_RE, (_m, dd, br, par, dol) => {
      const display = dd !== undefined || br !== undefined;
      store.push({ content: (dd ?? br ?? par ?? dol).trim(), display });
      return `%%%MATH${store.length - 1}%%%`;
    });
    let html = DOMPurify.sanitize(marked.parse(guarded, { breaks: true }) as string);
    html = html.replace(/%%%MATH(\d+)%%%/g, (_s: string, i: string) => {
      const m = store[+i];
      if (!m) return '';
      try {
        const src = m.display ? detachTags(m.content) : m.content;
        return katex.renderToString(src, { displayMode: m.display, throwOnError: false });
      } catch {
        return m.content;
      }
    });
    el.innerHTML = html; // katex output is trusted (locally generated), not re-sanitized
  } catch {
    el.textContent = text; // fall back to plain text if libs fail to load
  }
}

// ---- Streaming providers --------------------------------------------------

type OnDelta = (text: string) => void;

let webllmEngine: any = null;
let webllmModelId: string | null = null;

async function ensureLocalEngine(
  modelId: string,
  onProgress: (label: string, pct: number) => void
) {
  const webllm = await import('@mlc-ai/web-llm');
  const known = new Set(webllm.prebuiltAppConfig.model_list.map((m: any) => m.model_id));
  const wanted = known.has(modelId) ? modelId : LOCAL_MODELS.balanced.id;
  const initProgressCallback = (r: any) => onProgress(r.text || 'Loading model…', r.progress ?? 0);
  if (!webllmEngine) {
    const worker = new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' });
    webllmEngine = await webllm.CreateWebWorkerMLCEngine(worker, wanted, { initProgressCallback });
    webllmModelId = wanted;
  } else if (webllmModelId !== wanted) {
    await webllmEngine.reload(wanted);
    webllmModelId = wanted;
  }
  return webllmEngine;
}

// Each stream* function resolves to true when the provider stopped because it
// hit the completion-token cap (so the UI can offer to continue the answer).
async function streamLocal(
  system: string,
  history: ChatMessage[],
  modelId: string,
  onProgress: (label: string, pct: number) => void,
  onDelta: OnDelta
): Promise<boolean> {
  const engine = await ensureLocalEngine(modelId, onProgress);
  const chunks = await engine.chat.completions.create({
    stream: true,
    temperature: 0.3,
    max_tokens: 1200, // in-browser models have small context windows; keep modest
    messages: [{ role: 'system', content: system }, ...history],
  });
  let truncated = false;
  for await (const chunk of chunks) {
    const choice = chunk.choices?.[0];
    if (choice?.delta?.content) onDelta(choice.delta.content);
    if (choice?.finish_reason) truncated = choice.finish_reason === 'length';
  }
  return truncated;
}

async function streamAnthropic(
  system: string,
  history: ChatMessage[],
  model: string,
  apiKey: string,
  onDelta: OnDelta
): Promise<boolean> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const stream = client.messages.stream({
    model,
    max_tokens: 4096,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });
  stream.on('text', (delta: string) => onDelta(delta));
  const final = await stream.finalMessage();
  return final.stop_reason === 'max_tokens';
}

// OpenAI-compatible SSE (OpenRouter, OpenAI, custom endpoints).
async function streamOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  history: ChatMessage[],
  onDelta: OnDelta
): Promise<boolean> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (baseUrl.includes('openrouter')) {
    headers['HTTP-Referer'] = location.origin;
    headers['X-Title'] = 'Principles of Robot Autonomy';
  }
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'system', content: system }, ...history],
    }),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}). ${detail.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const evt of events) {
      const line = evt.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return truncated;
      try {
        const json = JSON.parse(data);
        const choice = json.choices?.[0];
        if (choice?.delta?.content) onDelta(choice.delta.content);
        if (choice?.finish_reason) truncated = choice.finish_reason === 'length';
      } catch {
        /* keep-alive / partial line */
      }
    }
  }
  return truncated;
}

// ---- UI wiring ------------------------------------------------------------

export function initBookAssistant() {
  const root = document.querySelector<HTMLElement>('.ba-root');
  if (!root) return;
  const chapterTitle = root.dataset.chapterTitle || 'this chapter';

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const launcher = $('.ba-launcher') as HTMLButtonElement;
  const panel = $('.ba-panel');
  const closeBtn = $('.ba-close') as HTMLButtonElement;
  const settingsBtn = $('.ba-settings') as HTMLButtonElement;
  const settingsPanel = $('.ba-settings-panel');
  const statusEl = $('.ba-status');
  const messagesEl = $('.ba-messages');
  const form = $('.ba-input') as HTMLFormElement;
  const textarea = $('.ba-textarea') as HTMLTextAreaElement;

  const providerSel = $('.ba-provider') as HTMLSelectElement;
  const orRow = $('.ba-row-openrouter');
  const orModelSel = $('.ba-or-model') as HTMLSelectElement;
  const localRow = $('.ba-row-local');
  const localSel = $('.ba-local-model') as HTMLSelectElement;
  const anthropicRow = $('.ba-row-anthropic');
  const anthropicSel = $('.ba-anthropic-model') as HTMLSelectElement;
  const openaiRow = $('.ba-row-openai');
  const openaiInput = $('.ba-openai-model') as HTMLInputElement;
  const otherRow = $('.ba-row-other');
  const otherBaseInput = $('.ba-other-base') as HTMLInputElement;
  const otherModelInput = $('.ba-other-model') as HTMLInputElement;
  const keyRow = $('.ba-row-key');
  const keyInput = $('.ba-key') as HTMLInputElement;

  let settings = loadSettings();
  let history: ChatMessage[] = [];
  let busy = false;
  const consentedModels = new Set<string>();
  let pendingQuestion: string | null = null;
  let consentModelId = '';
  let orModelsLoaded = false;

  function reflectSettingsToUI() {
    providerSel.value = settings.provider;
    localSel.value = settings.localModel;
    anthropicSel.value = settings.anthropicModel;
    openaiInput.value = settings.openaiModel;
    otherBaseInput.value = settings.otherBaseUrl;
    otherModelInput.value = settings.otherModel;
    const p = settings.provider;
    orRow.hidden = p !== 'openrouter';
    localRow.hidden = p !== 'local';
    anthropicRow.hidden = p !== 'anthropic';
    openaiRow.hidden = p !== 'openai';
    otherRow.hidden = p !== 'other';
    keyRow.hidden = p === 'local';
    if (p !== 'local') keyInput.value = settings.keys[p] || '';
    if (p === 'openrouter') ensureOrModels();
  }

  function readSettingsFromUI() {
    settings.provider = providerSel.value as Provider;
    settings.localModel = localSel.value as Settings['localModel'];
    if (orModelSel.value) settings.openrouterModel = orModelSel.value;
    settings.anthropicModel = anthropicSel.value;
    settings.openaiModel = openaiInput.value.trim() || 'gpt-4o-mini';
    settings.otherBaseUrl = otherBaseInput.value.trim();
    settings.otherModel = otherModelInput.value.trim();
    if (settings.provider !== 'local') settings.keys[settings.provider] = keyInput.value.trim();
    saveSettings(settings);
  }

  async function ensureOrModels() {
    if (orModelsLoaded) return;
    orModelsLoaded = true;
    orModelSel.innerHTML = '<option>Loading free models…</option>';
    const models = await fetchOpenRouterFreeModels();
    orModelSel.innerHTML = '';
    const list = models.length ? models : [{ id: settings.openrouterModel, name: settings.openrouterModel }];
    for (const m of list) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name.replace(/\s*\(free\)$/i, '') + ' · free';
      orModelSel.appendChild(opt);
    }
    if (list.some((m) => m.id === settings.openrouterModel)) orModelSel.value = settings.openrouterModel;
    else settings.openrouterModel = orModelSel.value;
  }

  function setStatus(html: string | null) {
    if (html == null) {
      statusEl.hidden = true;
      statusEl.innerHTML = '';
    } else {
      statusEl.hidden = false;
      statusEl.innerHTML = html;
    }
  }

  function addMessage(role: ChatMessage['role']): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = `ba-msg ba-msg-${role}`;
    const sender = document.createElement('div');
    sender.className = 'ba-sender';
    sender.textContent = role === 'assistant' ? 'PoRA' : 'You';
    const bubble = document.createElement('div');
    bubble.className = 'ba-bubble';
    wrap.appendChild(sender);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  function openPanel() {
    panel.hidden = false;
    root.classList.add('ba-open');
    textarea.focus();
    maybeShowIntro();
    loadMdLibs().catch(() => {}); // warm Markdown/KaTeX so live rendering is instant
  }
  function closePanel() {
    panel.hidden = true;
    root.classList.remove('ba-open');
  }

  function renderSetupCard() {
    setStatus(
      `<strong>One quick setup.</strong> The assistant answers with a free AI model — you just ` +
        `need a free key. It takes ~2 minutes: <a class="ba-link" href="/#assistant">open the setup guide</a>, ` +
        `create a free <strong>OpenRouter</strong> key, and paste it in ` +
        `<button class="ba-link ba-open-settings" type="button">⚙ settings</button>. ` +
        `Prefer Claude/OpenAI or running a model locally? Choose that in settings instead.`
    );
  }

  function renderConsentCard(model: LocalModel, question: string) {
    pendingQuestion = question;
    consentModelId = model.id;
    const dm = (navigator as any).deviceMemory;
    const lowMem = typeof dm === 'number' && dm <= 4;
    const memHint =
      lowMem && settings.localModel !== 'small'
        ? `<br><em>Your device reports limited memory — the <strong>Small</strong> size (in ⚙ settings) is more likely to run.</em>`
        : '';
    setStatus(
      `<strong>${model.label}</strong> runs entirely in your browser — nothing leaves your ` +
        `device. It needs a one-time <strong>${model.download}</strong> download and roughly ` +
        `<strong>${model.ramGB} GB</strong> of graphics memory. It won't run on every device.${memHint}<br>` +
        `<button class="ba-btn ba-consent" type="button">Download &amp; run locally</button>` +
        `<button class="ba-link ba-open-settings" type="button">use a hosted model instead</button>`
    );
  }

  function maybeShowIntro() {
    if (messagesEl.childElementCount > 0) return;
    if (settings.provider !== 'local' && !isConfigured(settings)) {
      renderSetupCard();
    } else if (settings.provider === 'local') {
      setStatus(
        `Ask a question about this chapter. Answers come from an open-weight model that runs ` +
          `entirely in your browser — nothing leaves your device. The first question starts a ` +
          `one-time download (its size is shown for approval first); it needs a WebGPU-capable ` +
          `browser and won't run on every device. No WebGPU? Add a free key in ⚙ settings.`
      );
    } else {
      setStatus(`Ask anything about <strong>${chapterTitle}</strong> — I'll answer from the chapter.`);
    }
  }

  async function streamAnswer(provider: Provider, system: string, onDelta: OnDelta, onProgress: (l: string, p: number) => void): Promise<boolean> {
    if (provider === 'local') {
      return streamLocal(system, history, LOCAL_MODELS[settings.localModel].id, onProgress, onDelta);
    } else if (provider === 'anthropic') {
      return streamAnthropic(system, history, settings.anthropicModel, settings.keys.anthropic, onDelta);
    } else if (provider === 'openrouter') {
      return streamOpenAICompatible(OPENROUTER_BASE, settings.keys.openrouter, settings.openrouterModel, system, history, onDelta);
    } else if (provider === 'openai') {
      return streamOpenAICompatible(OPENAI_BASE, settings.keys.openai, settings.openaiModel, system, history, onDelta);
    } else {
      if (!settings.otherBaseUrl) throw new Error('Set a base URL for the custom endpoint in settings.');
      return streamOpenAICompatible(settings.otherBaseUrl, settings.keys.other, settings.otherModel, system, history, onDelta);
    }
  }

  // silent = internal continuation: the question goes into the model history
  // but no user bubble is shown (used by the "Continue the answer" button).
  async function handleSend(question: string, silent = false) {
    if (busy) return;
    const provider = settings.provider;

    // Gate: hosted providers need a key; local needs WebGPU + download consent.
    if (provider !== 'local' && !isConfigured(settings)) {
      renderSetupCard();
      return;
    }
    if (provider === 'local') {
      const model = LOCAL_MODELS[settings.localModel];
      if (webllmModelId !== model.id) {
        const adapter = await pickAdapter();
        if (!adapter) {
          setStatus(
            `This browser or device can't run a model locally (no usable WebGPU). Add a free key ` +
              `in <button class="ba-link ba-open-settings" type="button">⚙ settings</button> to use a hosted model.`
          );
          return;
        }
        if (!consentedModels.has(model.id)) {
          renderConsentCard(model, question);
          return;
        }
      }
    }

    busy = true;
    form.classList.add('ba-busy');
    setStatus(null);
    if (!silent) addMessage('user').textContent = question;
    history.push({ role: 'user', content: question });

    const system = buildContext(question, provider, chapterTitle);
    const answerWrap = messagesEl.appendChild(document.createElement('div'));
    answerWrap.className = 'ba-msg ba-msg-assistant ba-streaming';
    const av = document.createElement('div');
    av.className = 'ba-sender';
    av.textContent = 'PoRA';
    const bubble = document.createElement('div');
    bubble.className = 'ba-bubble';
    bubble.innerHTML = '<span class="ba-typing"><i></i><i></i><i></i></span>';
    answerWrap.appendChild(av);
    answerWrap.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    let answer = '';
    let started = false;
    // Render Markdown + math live as tokens arrive, throttled to ~11 fps and
    // coalesced so overlapping async renders can't clobber each other.
    let rendering = false;
    let dirty = false;
    let paintTimer: number | undefined;
    let lastPaint = 0;
    async function paint() {
      if (rendering) { dirty = true; return; }
      rendering = true;
      do {
        dirty = false;
        await renderRich(bubble, answer);
      } while (dirty);
      rendering = false;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    function schedulePaint() {
      window.clearTimeout(paintTimer);
      const now = performance.now();
      if (now - lastPaint >= 90) {
        lastPaint = now;
        paint();
      } else {
        paintTimer = window.setTimeout(() => {
          lastPaint = performance.now();
          paint();
        }, 90);
      }
    }

    const onDelta: OnDelta = (t) => {
      if (!started) {
        started = true;
        bubble.innerHTML = '';
        setStatus(null);
      }
      answer += t;
      schedulePaint();
    };
    const onProgress = (label: string, pct: number) => {
      if (!started) setStatus(`${label} ${pct ? `(${Math.round(pct * 100)}%)` : ''}`);
    };

    try {
      const truncated = await streamAnswer(provider, system, onDelta, onProgress);
      window.clearTimeout(paintTimer);
      if (!answer.trim()) {
        bubble.textContent = '(no response — try again or a different model in ⚙ settings)';
      } else {
        history.push({ role: 'assistant', content: answer });
        await paint(); // final full render
        if (truncated) {
          setStatus(
            `The answer hit the response-length limit. ` +
              `<button class="ba-btn ba-continue" type="button">Continue the answer</button>`
          );
        }
      }
    } catch (err: any) {
      window.clearTimeout(paintTimer);
      const base = err?.message || 'Something went wrong.';
      const hint =
        provider === 'local'
          ? ' Your device may not have enough graphics memory — try the Small size in ⚙ settings, or a hosted model.'
          : ' Check your key/model in ⚙ settings; free models can also be rate-limited — try again shortly.';
      bubble.textContent = `⚠️ ${base}${hint}`;
      bubble.parentElement?.classList.add('ba-error');
      history.pop();
    } finally {
      answerWrap.classList.remove('ba-streaming');
      messagesEl.scrollTop = messagesEl.scrollHeight;
      busy = false;
      form.classList.remove('ba-busy');
    }
  }

  // Events
  launcher.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
  closeBtn.addEventListener('click', closePanel);
  settingsBtn.addEventListener('click', () => {
    settingsPanel.hidden = !settingsPanel.hidden;
  });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains('ba-open-settings')) settingsPanel.hidden = false;
    if (t.classList.contains('ba-continue')) {
      setStatus(null);
      handleSend('Continue your previous answer exactly where it left off. Do not repeat what you already wrote.', true);
    }
    if (t.classList.contains('ba-consent')) {
      consentedModels.add(consentModelId);
      const q = pendingQuestion;
      pendingQuestion = null;
      setStatus(null);
      if (q) handleSend(q);
    }
  });
  providerSel.addEventListener('change', () => {
    readSettingsFromUI();
    reflectSettingsToUI();
    if (messagesEl.childElementCount === 0) maybeShowIntro();
  });
  [orModelSel, localSel, anthropicSel, openaiInput, otherBaseInput, otherModelInput, keyInput].forEach((el) =>
    el.addEventListener('change', () => {
      readSettingsFromUI();
      if (messagesEl.childElementCount === 0) maybeShowIntro();
    })
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = textarea.value.trim();
    if (!q) return;
    textarea.value = '';
    handleSend(q);
  });
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  reflectSettingsToUI();
}
