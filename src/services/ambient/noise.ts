// Procedural noise generators, emitted as base64 WAV `data:` URIs so they can be
// fed to the Howler-based mixer exactly like a bundled loop — no special path.
// Used as the shipped, file-free default for `brown-noise`.

const SAMPLE_RATE = 22050;

/** Little-endian 16-bit PCM WAV wrapper around mono float samples (-1..1). */
function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): string {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  // btoa over a binary string is fine for the modest buffer sizes here (~1s mono).
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * One second of brown (red) noise, normalized — seamlessly loopable because the
 * integrator is gently leaked and the buffer is faded to the same level at both
 * ends. Memoized: generated at most once.
 */
let brownNoiseUri: string | null = null;
export function brownNoiseDataUri(): string {
  if (brownNoiseUri) return brownNoiseUri;

  const length = SAMPLE_RATE; // 1s loop
  const samples = new Float32Array(length);
  let last = 0;
  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    // Leaky integrator → brown spectrum; the 0.985 leak keeps it from drifting.
    last = 0.985 * last + 0.015 * white;
    samples[i] = last;
    peak = Math.max(peak, Math.abs(last));
  }

  const gain = peak > 0 ? 0.9 / peak : 1;
  // Short equal-power-ish fade at the seam so the loop point is inaudible.
  const fade = Math.floor(SAMPLE_RATE * 0.02);
  for (let i = 0; i < length; i += 1) {
    let env = 1;
    if (i < fade) env = i / fade;
    else if (i > length - fade) env = (length - i) / fade;
    samples[i] *= gain * env;
  }

  brownNoiseUri = encodeWav(samples);
  return brownNoiseUri;
}
