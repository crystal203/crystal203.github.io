import { decodeMap } from './decoder.js';
self.onmessage = async ({ data }) => {
  try { self.postMessage({ id: data.id, map: await decodeMap(data.buffer, data.name) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
