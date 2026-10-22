import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { cancelSpeech, listenWith, recognizeSpeech, SpeechUnavailableError, type SpeechSession } from "./speech.ts";

const manifest = readFileSync(
  new URL("../../../node_modules/@capacitor-community/speech-recognition/android/src/main/AndroidManifest.xml", import.meta.url),
  "utf8",
);

type Listener = (data: { matches?: string[]; status?: string }) => void;

function session(overrides: Partial<SpeechSession> & { script?: (listeners: Record<string, Listener>) => void } = {}): {
  speech: SpeechSession;
  calls: { start: unknown[]; request: number; check: number };
} {
  const listeners: Record<string, Listener> = {};
  const calls = { start: [] as unknown[], request: 0, check: 0 };
  const speech: SpeechSession = {
    available: async () => ({ available: true }),
    checkPermissions: async () => {
      calls.check += 1;
      return { speechRecognition: "prompt" };
    },
    requestPermissions: async () => {
      calls.request += 1;
      return { speechRecognition: "granted" };
    },
    start: async (options) => {
      calls.start.push(options);
      overrides.script?.(listeners);
      return { matches: [] };
    },
    stop: async () => {},
    addListener: async (event, listener) => {
      listeners[event] = listener;
      return { remove() {} };
    },
    ...overrides,
  };
  return { speech, calls };
}

describe("speech permissions and availability", () => {
  it("ships RECORD_AUDIO in the Android manifest the plugin merges", () => {
    assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
    const source = readFileSync(new URL("./speech.ts", import.meta.url), "utf8");
    assert.match(source, /requestPermissions/);
    assert.match(source, /partialResults:\s*true/);
    assert.match(source, /popup:\s*false/);
  });

  it("does not start listening when speech recognition is unavailable", async () => {
    const { speech, calls } = session({ available: async () => ({ available: false }) });
    assert.equal(await listenWith(speech), null);
    assert.equal(calls.start.length, 0);
    assert.equal(calls.request, 0);
  });

  it("asks for the microphone and does not start when permission stays denied", async () => {
    const { speech, calls } = session({
      requestPermissions: async () => {
        calls.request += 1;
        return { speechRecognition: "denied" };
      },
    });
    assert.equal(await listenWith(speech), null);
    assert.equal(calls.check, 1);
    assert.equal(calls.request, 1);
    assert.equal(calls.start.length, 0);
  });

  it("listens with partialResults and returns the transcript after the recognizer stops", async () => {
    const { speech, calls } = session({
      checkPermissions: async () => ({ speechRecognition: "granted" }),
      script(listeners) {
        setTimeout(() => {
          listeners.listeningState?.({ status: "stopped" });
          listeners.partialResults?.({ matches: ["add milk by 6 pm"] });
        }, 5);
      },
    });
    const heard = await listenWith(speech, { settleMs: 30, timeoutMs: 500 });
    assert.equal(heard, "add milk by 6 pm");
    assert.equal(calls.request, 0);
    assert.deepEqual(calls.start[0], {
      language: "en-US",
      maxResults: 1,
      prompt: "Say a command",
      partialResults: true,
      popup: false,
    });
  });

  it("uses the web recognizer when the shell is not the Android app", async () => {
    let loaded = false;
    const heard = await recognizeSpeech({
      native: false,
      plugin: session({
        available: async () => {
          loaded = true;
          return { available: true };
        },
      }).speech,
      web: async () => "check hydrant",
    });
    assert.equal(heard, "check hydrant");
    assert.equal(loaded, false);
  });

  it("says speech is unavailable when the Android recognizer is missing", async () => {
    const { speech, calls } = session({ available: async () => ({ available: false }) });
    await assert.rejects(() => recognizeSpeech({ native: true, plugin: speech }), SpeechUnavailableError);
    assert.equal(calls.start.length, 0);
  });

  it("cancelSpeech ends a listen that has not heard anything", async () => {
    const { speech } = session({
      checkPermissions: async () => ({ speechRecognition: "granted" }),
      start: async () => ({ matches: [] }),
    });
    const pending = listenWith(speech, { timeoutMs: 5000, settleMs: 50 });
    cancelSpeech();
    assert.equal(await pending, null);
  });

  it("uses the injected native plugin when the shell is Android", async () => {
    const { speech } = session({
      checkPermissions: async () => ({ speechRecognition: "granted" }),
      script(listeners) {
        listeners.partialResults?.({ matches: ["uncheck hydrant"] });
        listeners.listeningState?.({ status: "stopped" });
      },
    });
    const heard = await recognizeSpeech({ native: true, plugin: speech });
    assert.equal(heard, "uncheck hydrant");
  });
});
