import { log } from "./logger.js";
import { recordedEvents, sessionBuffers, pushSessionEvent } from "./storage.js";

// No need for ensureRecorderInjected anymore - it's auto-injected via content_scripts!

let isRecording = false;
let sessionId = null;

export async function startRecordingSession(metadata = {}) {
    sessionId = crypto.randomUUID();
    metadata.sessionId = sessionId;
    recordedEvents.length = 0;
    recordedEvents.metadata = metadata;
    isRecording = true;

    console.log("🎥 Starting recording session:", sessionId);

    // Tell all active tabs to start listening (recorder is already injected)
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: "startRecording",
                sessionId
            });
            console.log("✅ Recording started on tab:", tab.id);
        } catch (err) {
            console.warn("⚠️ Failed to start recording on tab:", tab.id, err);
        }
    }

    return { success: true, sessionId };
}

export async function stopRecordingSession() {
    log("🛑 Stopping recording session, total events:", recordedEvents.length);
    console.log("📊 Event types:", recordedEvents.map(e => e.type));
    console.log("🌐 Fetch events:", recordedEvents.filter(e => e.type === "fetch"));

    isRecording = false;

    // Tell all tabs to stop
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
        try {
            await chrome.tabs.sendMessage(tab.id, { action: "stopRecording" });
        } catch (err) {
            console.warn("⚠️ Failed to stop recording on tab:", tab.id);
        }
    }

    return { success: true, data: recordedEvents };
}

export async function getRecordingState() {
    return { success: true, isRecording, eventCount: recordedEvents.length };
}

export function getRecordedEvents() {
    return recordedEvents;
}

export function initRecordingHandlers() {
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        switch (req.action) {
            case "recordEvent":
                console.log("📥 Received event:", req.payload.type);
                if (req.payload.type === 'fetch') {
                    console.log("🌐 FETCH EVENT RECEIVED:", req.payload.data);
                }
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