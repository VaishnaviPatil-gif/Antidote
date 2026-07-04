/**
 * Client-side image downscaling for the snake identifier.
 *
 * A raw phone-camera photo is 3–8 MB (4000×3000+). Sent as base64 JSON that's
 * ~4–11 MB per request — which on a physical device times out, exceeds the
 * vision model's inline-image limit, and generally "just doesn't work" even when
 * the backend is reachable (desktop test images are tiny, so it looks fine there
 * and fails only on mobile). We downscale + JPEG-compress BEFORE upload so the
 * payload is ~50–150 KB: fast over cellular, well under model limits, identical
 * behaviour on desktop and phone.
 */

/** Read a File/Blob into a data URL. */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(file);
  });
}

/**
 * Downscale a data URL so its longest edge is <= maxEdge, re-encoding as JPEG.
 * Falls back to the original data URL if the canvas step is unavailable/tainted.
 * @param {string} dataUrl
 * @param {number} maxEdge  longest-side cap in px
 * @param {number} quality  JPEG quality 0..1
 * @returns {Promise<string>} a (usually much smaller) JPEG data URL
 */
export function downscaleDataUrl(dataUrl, maxEdge = 1024, quality = 0.72) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (!width || !height) return resolve(dataUrl);
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl); // e.g. very old WebView → send original rather than fail
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Read + downscale a File in one call. Always resolves to a JPEG data URL small
 * enough to upload from a phone.
 * @param {File|Blob} file
 * @param {{maxEdge?:number, quality?:number}} [opts]
 * @returns {Promise<string>}
 */
export async function compressImageFile(file, { maxEdge = 1024, quality = 0.72 } = {}) {
  const original = await readFileAsDataUrl(file);
  return downscaleDataUrl(original, maxEdge, quality);
}
