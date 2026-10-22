type SpeechListener = {
  remove: () => void | Promise<void>;
};

export type SpeechSession = {
  available: () => Promise<{ available: boolean }>;
  checkPermissions: () => Promise<{ speechRecognition: string }>;
  requestPermissions: () => Promise<{ speechRecognition: string }>;
  start: (options?: {
    language?: string;
    maxResults?: number;
    prompt?: string;
    partialResults?: boolean;
    popup?: boolean;
  }) => Promise<{ matches?: string[] }>;
  stop: () => Promise<void>;
  addListener: (
    eventName: "partialResults" | "listeningState",
    listener: (data: { matches?: string[]; status?: string }) => void,
  ) => Promise<SpeechListener>;
};

type WebResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };

type WebRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: WebResult) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop?: () => void;
  abort?: () => void;
};

type WebWindow = Window & {
  SpeechRecognition?: new () => WebRecognition;
  webkitSpeechRecognition?: new () => WebRecognition;
};

export type SpeechDeps = {
  native?: boolean;
  plugin?: SpeechSession;
  web?: () => Promise<string | null>;
};

function isNativeSpeech(): boolean {
  if (typeof window === "undefined") return false;
  return window.Capacitor?.isNativePlatform?.() === true;
}

export class SpeechUnavailableError extends Error {
  constructor() {
    super("Speech isn't available on this phone.");
    this.name = "SpeechUnavailableError";
  }
}

let listenGeneration = 0;
let stopCurrent: (() => void) | null = null;

/** Stop the recognizer that is running now. */
export function cancelSpeech(): void {
  listenGeneration += 1;
  const stop = stopCurrent;
  stopCurrent = null;
  stop?.();
}

export function speechReady(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeSpeech()) return true;
  const host = window as WebWindow;
  return Boolean(host.SpeechRecognition ?? host.webkitSpeechRecognition);
}

async function loadCapacitorPlugin(): Promise<SpeechSession> {
  const mod = await import("@capacitor-community/speech-recognition");
  return mod.SpeechRecognition as SpeechSession;
}

/**
 * Android only delivers the transcript on the partialResults listener.
 * start() with partialResults resolves immediately and its matches array is empty.
 */
export async function listenWith(
  speech: SpeechSession,
  timing: { timeoutMs?: number; settleMs?: number } = {},
): Promise<string | null> {
  const timeoutMs = timing.timeoutMs ?? 12000;
  const settleMs = timing.settleMs ?? 400;
  const generation = listenGeneration;
  let settled = false;
  let finish: (value: string | null) => void = () => {};
  const result = new Promise<string | null>((resolve) => {
    finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
  });
  const stop = () => {
    if (stopCurrent === stop) stopCurrent = null;
    finish(null);
  };
  stopCurrent = stop;
  if (listenGeneration !== generation) return null;
  const availability = await speech.available();
  if (listenGeneration !== generation) return null;
  if (!availability.available) return null;
  let permission = await speech.checkPermissions();
  if (permission.speechRecognition !== "granted") permission = await speech.requestPermissions();
  if (permission.speechRecognition !== "granted") return null;

  let heard = "";
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const partial = await speech.addListener("partialResults", (data) => {
    const next = data.matches?.[0]?.trim();
    if (next) heard = next;
  });
  const state = await speech.addListener("listeningState", (data) => {
    if (data.status !== "stopped") return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => finish(heard || null), settleMs);
  });
  const timer = setTimeout(() => finish(heard || null), timeoutMs);
  try {
    const started = await speech.start({
      language: "en-US",
      maxResults: 1,
      prompt: "Say a command",
      partialResults: true,
      popup: false,
    });
    const immediate = started.matches?.[0]?.trim();
    if (immediate) {
      heard = immediate;
      finish(heard);
    }
    return await result;
  } catch {
    return heard || null;
  } finally {
    clearTimeout(timer);
    clearTimeout(settleTimer);
    if (stopCurrent === stop) stopCurrent = null;
    await partial.remove();
    await state.remove();
    try {
      await speech.stop();
    } catch {
      /* recognizer already stopped */
    }
  }
}

function recognizeWeb(): Promise<string | null> {
  if (typeof window === "undefined") return Promise.reject(new SpeechUnavailableError());
  const host = window as WebWindow;
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  if (!Ctor) return Promise.reject(new SpeechUnavailableError());
  const generation = listenGeneration;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      const recognition = new Ctor();
      const stop = () => {
        if (stopCurrent === stop) stopCurrent = null;
        try {
          recognition.abort?.();
        } catch {
          /* already stopped */
        }
        finish(null);
      };
      stopCurrent = stop;
      if (listenGeneration !== generation) {
        stop();
        return;
      }
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        finish(event.results[0]?.[0]?.transcript?.trim() || null);
      };
      recognition.onerror = () => finish(null);
      recognition.start();
    } catch {
      finish(null);
    }
  });
}

/** Device speech only. Android uses the Capacitor plugin; the browser uses Web Speech. */
export async function recognizeSpeech(deps?: SpeechDeps): Promise<string | null> {
  const native = deps?.native ?? isNativeSpeech();
  try {
    if (native) {
      const speech = deps?.plugin ?? (await loadCapacitorPlugin());
      const availability = await speech.available();
      if (!availability.available) throw new SpeechUnavailableError();
      return await listenWith(speech);
    }
    if (deps?.web) return await deps.web();
    return await recognizeWeb();
  } catch (error) {
    if (error instanceof SpeechUnavailableError) throw error;
    return null;
  }
}
