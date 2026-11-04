// Human-speech detection that runs fully in the browser, using the Silero VAD v5 model through the same
// ONNX Runtime Web build that the phone detector uses. Unlike a loudness check it answers "is someone talking?",
// so a door slam, a dropped pen or a fan does not count, while quiet speech does.

const APP_BASE = import.meta.env.BASE_URL || '/';
const VAD_MODEL_URL = `${APP_BASE}models/silero_vad_v5.onnx`;
const ORT_WASM_PATH = `${APP_BASE}ort/`;

const MODEL_RATE = 16000;
const FRAME = 512;          // samples per model call (32 ms)
const CONTEXT = 64;         // tail of the previous frame, as the model expects
const SPEECH_PROB = 0.5;    // a frame counts as speech at or above this probability
const WINDOW_FRAMES = 63;   // about 2 s of frames
const TRIGGER_FRAMES = 25;  // about 0.8 s of speech inside the window reports a violation

export interface SpeechEvent {
    /** Seconds of speech inside the last window. */
    seconds: number;
    /** Highest speech probability seen in the window. */
    confidence: number;
}

export interface SpeechDetector {
    close(): void;
}

/** Throws if the model or the audio graph cannot start, so the caller can fall back to a loudness check. */
export async function createSpeechDetector(stream: MediaStream, onSpeech: (e: SpeechEvent) => void): Promise<SpeechDetector> {
    if (!stream.getAudioTracks().length) throw new Error('No audio track');
    const ort: any = await import('onnxruntime-web/wasm');
    ort.env.wasm.wasmPaths = ORT_WASM_PATH;
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(VAD_MODEL_URL, { executionProviders: ['wasm'] });
    const sr = new ort.Tensor('int64', [BigInt(MODEL_RATE)]);
    let state = new ort.Tensor('float32', new Float32Array(2 * 128), [2, 1, 128]);
    let context = new Float32Array(CONTEXT);

    const AudioCtx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0; // the processor only runs while connected to the output; keep the student's speakers silent
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);

    const ratio = ctx.sampleRate / MODEL_RATE;
    let pending = new Float32Array(0);
    let phase = 0;
    let closed = false;
    let busy = false;
    const recent: number[] = [];

    const infer = async (frame: Float32Array) => {
        const input = new Float32Array(CONTEXT + FRAME);
        input.set(context, 0);
        input.set(frame, CONTEXT);
        context = frame.slice(-CONTEXT);
        const out = await session.run({ input: new ort.Tensor('float32', input, [1, input.length]), state, sr });
        state = out.stateN;
        return Number(out.output.data[0]);
    };

    const drain = async () => {
        if (busy) return;
        busy = true;
        try {
            while (!closed && pending.length >= FRAME) {
                const frame = pending.slice(0, FRAME);
                pending = pending.slice(FRAME);
                const p = await infer(frame);
                recent.push(p);
                if (recent.length > WINDOW_FRAMES) recent.shift();
                const speech = recent.filter(v => v >= SPEECH_PROB);
                if (speech.length >= TRIGGER_FRAMES) {
                    onSpeech({ seconds: Number(((speech.length * FRAME) / MODEL_RATE).toFixed(1)), confidence: Number(Math.max(...recent).toFixed(2)) });
                    recent.length = 0;
                }
            }
        } finally {
            busy = false;
        }
    };

    processor.onaudioprocess = (e) => {
        if (closed) return;
        const input = e.inputBuffer.getChannelData(0);
        // Resample to 16 kHz by averaging the input samples that fall in each output sample.
        const out: number[] = [];
        let pos = phase;
        while (pos + ratio <= input.length) {
            const start = Math.floor(pos);
            const end = Math.max(start + 1, Math.floor(pos + ratio));
            let sum = 0;
            for (let i = start; i < end; i++) sum += input[i];
            out.push(sum / (end - start));
            pos += ratio;
        }
        phase = pos - input.length;
        if (out.length) {
            const merged = new Float32Array(pending.length + out.length);
            merged.set(pending, 0);
            merged.set(out, pending.length);
            // If inference ever falls behind, drop the oldest audio instead of growing without limit.
            pending = merged.length > MODEL_RATE * 5 ? merged.slice(-MODEL_RATE * 5) : merged;
            void drain();
        }
    };

    return {
        close() {
            closed = true;
            try { processor.disconnect(); source.disconnect(); mute.disconnect(); } catch { /* ignore */ }
            try { void ctx.close(); } catch { /* ignore */ }
            try { void session.release?.(); } catch { /* ignore */ }
        }
    };
}
