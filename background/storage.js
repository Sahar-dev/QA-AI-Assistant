// background/storage.js
import { log } from "./logger.js";
import { generateTestFromEvents } from "./codegen.js";

// ===== Centralized shared state =====
export const sessionBuffers = new Map();
export const recordedEvents = [];

// Push individual session events (used by recording.js)
export function pushSessionEvent(tabId, evt) {
    if (!tabId) return;
    const now = Date.now();
    const buffer = sessionBuffers.get(tabId) || [];
    buffer.push({ ...evt, t: now });
    sessionBuffers.set(tabId, buffer);

    // Also store globally if recording is active
    recordedEvents.push({ ...evt, t: now });
}

// Export session data (used by exportSession)
export function exportSessionData(sender, sendResponse) {
    const tabId = sender?.tab?.id;
    const data = sessionBuffers.get(tabId) || [];
    sendResponse({ success: true, data });
}

// ===== Save test to storage =====
export async function saveTestToStorage(framework) {
    const data = await chrome.storage.local.get([
        "savedTests",
        "collections",
        "activeCollection",
    ]);

    const existing = data.savedTests || [];
    const test = {
        id: Date.now(),
        framework,
        createdAt: new Date().toISOString(),
        eventCount: recordedEvents.length,
        code: generateTestFromEvents(framework, recordedEvents),
        testName: recordedEvents.metadata?.testName || "Untitled Test",
        testDescription: recordedEvents.metadata?.testDescription || "",
    };

    existing.push(test);
    await chrome.storage.local.set({ savedTests: existing });
    log("💾 Test saved");

    // Save into active collection if one exists
    if (data.activeCollection) {
        const collections = data.collections || [];
        const col = collections.find((c) => c.id === data.activeCollection);
        if (col) {
            col.tests = col.tests || [];
            col.tests.push(test);
            await chrome.storage.local.set({ collections });
            log(`📁 Added to collection: ${col.name}`);
        }
    }

    return { success: true, code: test.code };
}
