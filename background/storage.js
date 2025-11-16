// background/storage.js
import { log } from "./logger.js";
import { generateForFramework } from "./codegen.js";

// ===== Centralized shared state =====
export const sessionBuffers = new Map();
export const recordedEvents = [];
recordedEvents.metadata = recordedEvents.metadata || {};

const EVENT_DEDUP_CACHE = new Map();
const EVENT_DEDUP_LIMIT = 200;

const ACTIVE_SESSION_KEY = "qa_active_session";
const SESSION_HISTORY_KEY = "qa_session_history";
const SESSION_HISTORY_LIMIT = 10;

let activeSessionCache = null;
let sessionHistoryCache = [];

function cloneSession(session) {
    if (!session) return null;
    if (typeof structuredClone === "function") {
        return structuredClone(session);
    }
    return JSON.parse(JSON.stringify(session));
}

function normalizeMetadata(metadata = {}) {
    const normalized = {
        testName: metadata.testName || "Recorded Test",
        testDescription: metadata.testDescription || "",
        startUrl: metadata.startUrl || "",
        sessionId: metadata.sessionId,
        startedAt: metadata.startedAt || Date.now(),
        mode: metadata.mode || "test",
        modeSettings: metadata.modeSettings || {},
    };

    if (metadata.tags) normalized.tags = metadata.tags;
    if (metadata.lastResumedAt) normalized.lastResumedAt = metadata.lastResumedAt;
    return normalized;
}

function getEventSignature(evt = {}) {
    const ts = evt.timestamp || evt.t || 0;
    let dataSig = "";
    if (evt.data) {
        try {
            dataSig = JSON.stringify(evt.data);
        } catch {
            dataSig = String(evt.data);
        }
    }
    return `${evt.type || "unknown"}|${ts}|${evt.url || ""}|${dataSig}`.slice(0, 500);
}

function shouldSkipDuplicateEvent(sessionId, signature) {
    if (!sessionId || !signature) return false;
    let bucket = EVENT_DEDUP_CACHE.get(sessionId);
    if (!bucket) {
        bucket = { order: [], set: new Set() };
        EVENT_DEDUP_CACHE.set(sessionId, bucket);
    }
    if (bucket.set.has(signature)) {
        return true;
    }
    bucket.set.add(signature);
    bucket.order.push(signature);
    if (bucket.order.length > EVENT_DEDUP_LIMIT) {
        const expired = bucket.order.shift();
        if (expired) bucket.set.delete(expired);
    }
    return false;
}

function clearDedupCache(sessionId) {
    if (sessionId) {
        EVENT_DEDUP_CACHE.delete(sessionId);
    }
}

async function restoreActiveSession() {
    try {
        const data = await chrome.storage.local.get([ACTIVE_SESSION_KEY]);
        const session = data[ACTIVE_SESSION_KEY];
        if (session && Array.isArray(session.events)) {
            activeSessionCache = session;
            recordedEvents.length = 0;
            recordedEvents.push(...session.events);
            recordedEvents.metadata = session.metadata || {};
        } else {
            activeSessionCache = null;
        }
    } catch (err) {
        console.warn("Failed to restore active session:", err);
        activeSessionCache = null;
    }
}

async function restoreSessionHistory() {
    try {
        const data = await chrome.storage.local.get([SESSION_HISTORY_KEY]);
        const history = data[SESSION_HISTORY_KEY];
        sessionHistoryCache = Array.isArray(history) ? history : [];
        sessionHistoryCache.sort((a, b) => (b?.endedAt || 0) - (a?.endedAt || 0));
    } catch (err) {
        console.warn("Failed to restore session history:", err);
        sessionHistoryCache = [];
    }
}

export const sessionPersistenceReady = (async () => {
    await Promise.all([restoreSessionHistory(), restoreActiveSession()]);
})();

async function persistSessionHistory() {
    try {
        await chrome.storage.local.set({ [SESSION_HISTORY_KEY]: sessionHistoryCache });
    } catch (err) {
        console.warn("Failed to persist session history:", err);
    }
}

async function persistActiveSessionEvent(evt) {
    if (!activeSessionCache) return;
    if (activeSessionCache.id && evt.sessionId && activeSessionCache.id !== evt.sessionId) return;
    activeSessionCache.events = activeSessionCache.events || [];
    activeSessionCache.events.push(evt);
    try {
        await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: activeSessionCache });
    } catch (err) {
        console.warn("Failed to persist active session event:", err);
    }
}

export function getActiveSessionSnapshot() {
    return cloneSession(activeSessionCache);
}

export function getSessionHistorySnapshot() {
    return sessionHistoryCache.map(cloneSession);
}

export function getSessionById(sessionId) {
    if (!sessionId) return null;
    if (activeSessionCache?.id === sessionId) return cloneSession(activeSessionCache);
    const match = sessionHistoryCache.find((s) => s.id === sessionId);
    return cloneSession(match);
}

export async function createActiveSession(metadata = {}) {
    if (!metadata.sessionId) {
        throw new Error("Session ID is required to start recording");
    }

    const normalized = normalizeMetadata(metadata);
    recordedEvents.length = 0;
    recordedEvents.metadata = normalized;
    clearDedupCache(normalized.sessionId);

    activeSessionCache = {
        id: normalized.sessionId,
        metadata: normalized,
        events: [],
        exploratorySummary: null,
        bugBundle: null,
    };

    try {
        await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: activeSessionCache });
    } catch (err) {
        console.warn("Failed to persist active session metadata:", err);
    }
}

export async function updateActiveSessionMetadata(patch = {}) {
    if (!activeSessionCache) return;
    activeSessionCache.metadata = { ...activeSessionCache.metadata, ...patch };
    recordedEvents.metadata = activeSessionCache.metadata;

    try {
        await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: activeSessionCache });
    } catch (err) {
        console.warn("Failed to update active session metadata:", err);
    }
}

export async function archiveActiveSession(status = "completed", options = {}) {
    if (!activeSessionCache) return null;
    const discardIfEmpty = options.discardIfEmpty ?? true;
    const hasEvents = (activeSessionCache.events || []).length > 0;

    const snapshot = {
        ...activeSessionCache,
        status,
        endedAt: Date.now(),
    };

    activeSessionCache = null;

    try {
        await chrome.storage.local.remove(ACTIVE_SESSION_KEY);
    } catch (err) {
        console.warn("Failed to clear active session:", err);
    }

    if (!hasEvents && discardIfEmpty) {
        return null;
    }

    clearDedupCache(snapshot.id);
    sessionHistoryCache = [
        snapshot,
        ...sessionHistoryCache.filter((s) => s.id !== snapshot.id),
    ].slice(0, SESSION_HISTORY_LIMIT);

    await persistSessionHistory();
    return snapshot;
}

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
    const sessionEvent = { ...evt, t: now };
    const sessionKey = sessionEvent.sessionId || recordedEvents.metadata?.sessionId;
    const signature = getEventSignature(sessionEvent);
    if (shouldSkipDuplicateEvent(sessionKey, signature)) {
        return;
    }
    const buffer = sessionBuffers.get(tabId) || [];
    buffer.push(sessionEvent);
    sessionBuffers.set(tabId, buffer);
    recordedEvents.push(sessionEvent);

    // �Y"� keep buffer safe in chrome.storage.session & local history
    await Promise.all([
        persistBuffer(tabId, buffer),
        persistActiveSessionEvent(sessionEvent),
    ]);
}

export async function deleteSessionFromHistory(sessionId) {
    if (!sessionId) return false;
    const before = sessionHistoryCache.length;
    sessionHistoryCache = sessionHistoryCache.filter((s) => s.id !== sessionId);
    if (sessionHistoryCache.length === before) return false;
    await persistSessionHistory();
    return true;
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
        // �o. pass options here
        testName: recordedEvents.metadata?.testName || "Untitled Test",
        testDescription: recordedEvents.metadata?.testDescription || "",
    };

    existing.push(test);
    await chrome.storage.local.set({ savedTests: existing });
    log("�Y'� Test saved");

    // Save into active collection if one exists
    if (data.activeCollection) {
        const collections = data.collections || [];
        const col = collections.find((c) => c.id === data.activeCollection);
        if (col) {
            col.tests = col.tests || [];
            col.tests.push(test);
            await chrome.storage.local.set({ collections });
            log(`�Y"? Added to collection: ${col.name}`);
        }
    }

    return { success: true, code: test.code };
}
