// pdf.js worker entry: install polyfills, then load the real worker.
// It must also re-export WorkerMessageHandler: when a browser can't start a real worker
// (Safari opening the page from a file, some private modes), pdf.js falls back to a "fake worker"
// that imports this file on the main thread and reads that export. Without it you get
// 'Setting up fake worker failed: "undefined is not an object (evaluating 't.setup')"'.
import './polyfills.js';
export { WorkerMessageHandler } from './vendor/pdf.worker.min.mjs';
