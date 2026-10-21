// Copies the ONNX Runtime WebAssembly files into public/ort so the detector runs from our own server
// (no CDN needed, which matters on campus networks that block third-party hosts).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dst = path.join(root, 'public', 'ort');
mkdirSync(dst, { recursive: true });
for (const f of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  if (!existsSync(path.join(src, f))) throw new Error(`Missing ${f} in onnxruntime-web; run npm install`);
  copyFileSync(path.join(src, f), path.join(dst, f));
}
console.log('onnxruntime-web wasm copied to public/ort');
