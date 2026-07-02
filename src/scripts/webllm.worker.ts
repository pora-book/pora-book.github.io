// Web Worker host for the in-browser WebLLM engine. Running the model in a
// worker keeps token generation off the main thread so the reading page stays
// responsive during inference. See src/scripts/book-assistant.ts for the client
// side that spawns this worker via CreateWebWorkerMLCEngine.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
