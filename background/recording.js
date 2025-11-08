import { log } from "./logger.js";
import { recordedEvents, sessionBuffers, pushSessionEvent } from "./storage.js";

async function ensureRecorderInjected(tabId) {
    try {
        const [{ result }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => !!window.__qaRecorderInjected
        });
        if (result) return;

        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["recording/recorder.js"]
        });
        console.log("🧩 Recorder injected dynamically");
    } catch (err) {
        console.warn("Recorder injection failed:", err);
    }
}

const SESSION_WINDOW_MS = 5 * 60 * 1000;
let lastActivePageTab = null;
let isRecording = false;

// === Core Recording Logic ===

export async function startRecordingSession(metadata = {}) {
    log("🎬 Starting manual recording session");
    isRecording = true;
    recordedEvents.length = 0;        // 🔥 clears shared array without breaking reference
    recordedEvents.metadata = metadata;

    // Tell all active tabs to start listening
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
        await ensureRecorderInjected(tab.id);
        await chrome.tabs.sendMessage(tab.id, { action: "startRecording" }).catch(() => { });
    }


    return { success: true, message: "Recording started" };
}

export async function stopRecordingSession() {
    log("🛑 Stopping manual recording session, total:", recordedEvents.length);
    isRecording = false;

    // Tell all tabs to stop
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
        await chrome.tabs.sendMessage(tab.id, { action: "stopRecording" }).catch(() => { });
    }

    return { success: true, data: recordedEvents };
}

export async function getRecordingState() {
    return { success: true, isRecording, eventCount: recordedEvents.length };
}

export function getRecordedEvents() {
    return recordedEvents;
}

// === Optional Modular Registration ===
export function initRecordingHandlers() {
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        switch (req.action) {
            case "recordEvent":
                pushSessionEvent(sender.tab?.id, req.payload);
                sendResponse({ success: true });
                break;

            case "startRecordingSession":
                startRecordingSession(req.metadata).then(sendResponse);
                break;

            case "stopRecordingSession":
                stopRecordingSession().then(sendResponse);
                break;

            case "getRecordingState":
                getRecordingState().then(sendResponse);
                break;

            default:
                return;
        }
        return true;
    });
    log("🎧 Recording handlers initialized");
}

