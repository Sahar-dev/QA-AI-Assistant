// background/storage.js
import { log } from "./logger.js";
import { generateForFramework } from "./codegen.js";

// ===== Centralized shared state =====
export const sessionBuffers = new Map();
export const recordedEvents = [];
// Persist temp events safely (MV3 service worker can sleep)
async function persistBuffer(tabId, events) {
    try {
        await chrome.storage.session.set({ [`buffer_${tabId}`]: events });
    } catch (err) {
        console.warn("Session persistence failed:", err);
    }
}

export async function getBuffer(tabId) {
    const data = await chrome.storage.session.get(`buffer_${tabId}`);
    return data[`buffer_${tabId}`] || [];
}

// Push individual session events (used by recording.js)
export async function pushSessionEvent(tabId, evt) {
    if (!tabId) return;
    const now = Date.now();
    const buffer = sessionBuffers.get(tabId) || [];
    buffer.push({ ...evt, t: now });
    sessionBuffers.set(tabId, buffer);
    recordedEvents.push({ ...evt, t: now });

    // 🔥 keep buffer safe in chrome.storage.session
    await persistBuffer(tabId, buffer);
}


// Export session data (used by exportSession)
export function exportSessionData(sender, sendResponse) {
    const tabId = sender?.tab?.id;
    const data = sessionBuffers.get(tabId) || [];
    sendResponse({ success: true, data });
}

// ===== Save test to storage =====
export async function saveTestToStorage(framework, options = {}) {
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
        code: generateForFramework(framework || "cypress", recordedEvents, options),
        // ✅ pass options here
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