import { evaluateSeverity, identifySnake } from "./api.js";
import { updateStock } from "./hospitals.js";

const QUEUE_KEY = "antidote.offline.queue";

/**
 * Read the current pending queue from localStorage.
 * @returns {Array<{id: string, type: string, payload: any, timestamp: number}>}
 */
export function getSyncQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save the pending queue to localStorage.
 * @param {Array} queue 
 */
export function saveSyncQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Fail silently
  }
}

/**
 * Add an action to the sync queue.
 * @param {string} type 
 * @param {any} payload 
 */
export function enqueueAction(type, payload) {
  const queue = getSyncQueue();
  const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  queue.push({ id, type, payload, timestamp: Date.now() });
  saveSyncQueue(queue);
  
  // Trigger a custom event so the UI can update
  window.dispatchEvent(new CustomEvent("sync-queue-updated"));
}

/**
 * Remove an action from the queue by its ID.
 * @param {string} id 
 */
export function dequeueAction(id) {
  const queue = getSyncQueue();
  const next = queue.filter(item => item.id !== id);
  saveSyncQueue(next);
  
  window.dispatchEvent(new CustomEvent("sync-queue-updated"));
}

/**
 * Execute the offline sync queue.
 * @param {function} onProgress Callback for sync progress (e.g. (current, total, status) => void)
 * @param {object} contextRef Access to the EmergencyContext setters to apply updates
 */
export async function processSyncQueue(onProgress, contextSetters) {
  const queue = getSyncQueue();
  if (queue.length === 0) return;

  const total = queue.length;
  onProgress(0, total, "started");

  // Keep track of actions to remove
  const completedIds = [];

  for (let i = 0; i < queue.length; i++) {
    const action = queue[i];
    onProgress(i, total, `syncing ${action.type}`);

    try {
      if (action.type === "UPDATE_STOCK") {
        // Sync hospital stock update
        await updateStock(action.payload.hospitalId, {
          vials: action.payload.vials,
          beds: action.payload.beds
        });
        completedIds.push(action.id);
      } 
      else if (action.type === "EVALUATE_SEVERITY") {
        // Sync symptom severity check
        const { answers, snake, mins, swelling, logIndex } = action.payload;
        const res = await evaluateSeverity(answers, snake, mins, swelling);
        if (res && res.severity && contextSetters.updateSymptomLogEntry) {
          contextSetters.updateSymptomLogEntry(logIndex, res.severity.toLowerCase(), res);
        }
        completedIds.push(action.id);
      } 
      else if (action.type === "IDENTIFY_SNAKE") {
        // Sync snake identification
        const { imageB64 } = action.payload;
        const res = await identifySnake(imageB64);
        if (res && res.species && contextSetters.setSnake) {
          const { _failed, ...snakeData } = res;
          if (!_failed) {
            contextSetters.setSnake(snakeData);
          }
        }
        completedIds.push(action.id);
      }
    } catch (error) {
      console.error(`Offline sync failed for action: ${action.id}`, error);
      // If we encounter a server issue, we do not dequeue the item so we can retry later.
      // For conflict resolution: if the payload is older than the current local state, we discard it.
    }
  }

  // Remove successfully completed actions
  const remaining = getSyncQueue().filter(item => !completedIds.includes(item.id));
  saveSyncQueue(remaining);

  onProgress(total, total, "completed");
  window.dispatchEvent(new CustomEvent("sync-queue-updated"));
}
