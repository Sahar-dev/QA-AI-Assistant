import { log } from "./logger.js";
import {
    recordedEvents,
    pushSessionEvent,
    createActiveSession,
    archiveActiveSession,
    getActiveSessionSnapshot,
    getSessionHistorySnapshot,
    getSessionById,
    updateActiveSessionMetadata,
    deleteSessionFromHistory,
    sessionPersistenceReady,
} from "./storage.js";

// No need for ensureRecorderInjected anymore - it's auto-injected via content_scripts!

let isRecording = false;
let sessionId = null;
let lastCompletedSession = null;

sessionPersistenceReady
    .then(() => {
        const active = getActiveSessionSnapshot();
        if (active?.id) {
            sessionId = active.id;
            isRecording = true;
            recordedEvents.metadata = active.metadata || recordedEvents.metadata || {};
            log("�o. Restored active recording session:", sessionId);
        }
    })
    .catch((err) => console.warn("Failed to restore recording session:", err));

async function notifyTabsStart(resume = false) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: "startRecording",
                sessionId,
                resume,
                mode: recordedEvents.metadata?.mode || "test",
                modeSettings: recordedEvents.metadata?.modeSettings || {},
            });
            console.log("�o. Recording flag sent to tab:", tab.id);
        } catch (err) {
            console.warn("�s���? Failed to toggle recording on tab:", tab.id, err);
        }
    }
}

async function notifyTabsStop() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    for (const tab of tabs) {
        try {
            await chrome.tabs.sendMessage(tab.id, { action: "stopRecording" });
        } catch (err) {
            console.warn("�s���? Failed to stop recording on tab:", tab.id, err);
        }
    }
}

export async function startRecordingSession(metadata = {}) {
    await sessionPersistenceReady;

    if (sessionId) {
        await archiveActiveSession("restarted", { discardIfEmpty: true });
    }

    sessionId = crypto.randomUUID();
    const sessionMeta = {
        ...metadata,
        sessionId,
        startedAt: Date.now(),
    };

    await createActiveSession(sessionMeta);
    isRecording = true;

    console.log("�YZ� Starting recording session:", sessionId);
    await notifyTabsStart();

    return { success: true, sessionId };
}

export async function stopRecordingSession() {
    log("�Y>' Stopping recording session, total events:", recordedEvents.length);
    console.log("�Y\"S Event types:", recordedEvents.map((e) => e.type));
    console.log("�YO? Fetch events:", recordedEvents.filter((e) => e.type === "fetch"));

    isRecording = false;
    await notifyTabsStop();

    const archived = await archiveActiveSession("completed", { discardIfEmpty: true });
    const response = { success: true, data: recordedEvents };
    if (archived) {
        response.session = archived;
        lastCompletedSession = archived;
    } else if (recordedEvents.length) {
        lastCompletedSession = {
            id: sessionId,
            metadata: recordedEvents.metadata || {},
            events: [...recordedEvents],
            endedAt: Date.now(),
        };
    }
    sessionId = null;
    return response;
}

export async function resumeRecordingSession() {
    await sessionPersistenceReady;

    const active = getActiveSessionSnapshot();
    if (!active?.id) {
        return { success: false, error: "No session available to resume" };
    }

    sessionId = active.id;
    recordedEvents.metadata = active.metadata || recordedEvents.metadata || {};
    isRecording = true;

    await updateActiveSessionMetadata({ lastResumedAt: Date.now() });
    await notifyTabsStart(true);

    return { success: true, sessionId };
}

export async function getRecordingState() {
    return {
        success: true,
        isRecording,
        eventCount: recordedEvents.length,
        sessionId,
        metadata: recordedEvents.metadata || null,
    };
}

export function getRecordedEvents() {
    return recordedEvents;
}

export function initRecordingHandlers() {
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        switch (req.action) {
            case "recordEvent":
                console.log("�Y\"� Received event:", req.payload.type);
                if (req.payload.type === "fetch") {
                    console.log("�YO? FETCH EVENT RECEIVED:", req.payload.data);
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

            case "resumeRecordingSession":
                resumeRecordingSession().then(sendResponse);
                break;

            case "getRecordingState":
                getRecordingState().then(sendResponse);
                break;

            case "getActiveSession":
                sessionPersistenceReady
                    .then(() => {
                        sendResponse({ success: true, session: getActiveSessionSnapshot() });
                    })
                    .catch((err) => {
                        console.warn("Failed to load active session snapshot:", err);
                        sendResponse({ success: false, error: err.message });
                    });
                break;

            case "getSessionHistory":
                sessionPersistenceReady
                    .then(() => {
                        sendResponse({ success: true, sessions: getSessionHistorySnapshot() });
                    })
                    .catch((err) => {
                        console.warn("Failed to load session history:", err);
                        sendResponse({ success: false, error: err.message });
                    });
                break;

            case "getSessionById":
                sessionPersistenceReady
                    .then(() => {
                        sendResponse({ success: true, session: getSessionById(req.sessionId) });
                    })
                    .catch((err) => {
                        console.warn("Failed to get session by id:", err);
                        sendResponse({ success: false, error: err.message });
                    });
                break;

            case "deleteSession":
                sessionPersistenceReady
                    .then(async () => {
                        if (sessionId && sessionId === req.sessionId) {
                            sendResponse({ success: false, error: "Cannot delete an active recording session." });
                            return;
                        }
                        const removed = await deleteSessionFromHistory(req.sessionId);
                        sendResponse({ success: removed });
                    })
                    .catch((err) => {
                        console.warn("Failed to delete session:", err);
                        sendResponse({ success: false, error: err.message });
                    });
                break;

            default:
                return;
        }
        return true;
    });
    log("�YZ� Recording handlers initialized");
}

export async function generateExploratorySummaryReport() {
    const session = lastCompletedSession;
    if (!session || session.metadata?.mode !== "explore") {
        return { success: false, error: "No exploratory session available" };
    }
    const summary = buildExploratorySummary(session);
    return { success: true, summary: summary.text, stats: summary.stats };
}

export async function exportBugBundleReport() {
    const session = lastCompletedSession;
    if (!session || session.metadata?.mode !== "bug") {
        return { success: false, error: "No bug hunt session available" };
    }
    const bundle = buildBugBundle(session);
    return { success: true, bundle };
}

function buildExploratorySummary(session) {
    const events = session.events || [];
    const navEvents = events.filter((e) => e.type === "navigation");
    const uniqueUrls = new Set(navEvents.map((e) => e.data?.href || e.url));
    const flowEvents = events.filter((e) => e.type === "flow_marker");
    const flowStats = flowEvents.reduce((acc, ev) => {
        const name = ev.data?.flow || "General";
        acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {});
    const repeatedSelectors = {};
    events.forEach((ev) => {
        if (["click", "input", "select"].includes(ev.type) && ev.data?.selector) {
            const key = ev.data.selector;
            repeatedSelectors[key] = (repeatedSelectors[key] || 0) + 1;
        }
    });
    const repeatedAttempts = Object.entries(repeatedSelectors)
        .filter(([, count]) => count >= 3)
        .map(([selector, count]) => `${selector} (${count} interactions)`);
    const slowComponents = events
        .filter((ev) => ev.type === "slow_fetch")
        .map((ev) => `${ev.data?.method || "GET"} ${ev.data?.url || ""} ${ev.data?.timeMs || 0}ms`);
    const errors = events.filter((ev) => ev.type === "error");

    const summaryLines = [
        `Exploratory session "${session.metadata?.testName || "Exploration"}" touched ${uniqueUrls.size || 1} view(s).`,
        `Recorded ${events.length} meaningful interactions and ${errors.length} errors.`,
        flowEvents.length
            ? `Flows detected: ${Object.entries(flowStats)
                  .map(([name, count]) => `${name} (${count})`)
                  .join(", ")}`
            : "Flows detected: General exploration.",
        slowComponents.length
            ? `Slow components: ${slowComponents.slice(0, 5).join("; ")}`
            : "No slow components detected above threshold.",
        repeatedAttempts.length
            ? `Repeated interactions: ${repeatedAttempts.slice(0, 5).join("; ")}`
            : "No repeated frustrations detected.",
    ];

    return {
        text: summaryLines.join("\n"),
        stats: {
            flows: flowStats,
            slowComponents,
            repeatedAttempts,
            errors: errors.length,
        },
    };
}

function buildBugBundle(session) {
    const events = session.events || [];
    const steps = events
        .filter((ev) =>
            ["click", "input", "navigation", "form_submit", "drag_drop", "hover"].includes(ev.type)
        )
        .map((ev) => ({
            type: ev.type,
            selector: ev.data?.selector,
            text: ev.data?.text,
            url: ev.url,
            timestamp: ev.timestamp,
        }));
    const networkFailures = events.filter(
        (ev) => ev.type === "fetch" && (ev.data?.status || 0) >= 400
    );
    const apiErrors = events.filter((ev) => ev.type === "fetch_error");
    const slowApis = events.filter((ev) => ev.type === "slow_fetch");
    const consoleErrors = events.filter((ev) => ev.type === "error");
    const bugSignals = events.filter((ev) => ev.type === "bug_signal");
    const perfIssues = events.filter((ev) =>
        ["perf_longtask", "fps_drop", "layout_shift"].includes(ev.type)
    );

    const rootCause = deriveRootCause(networkFailures, consoleErrors, bugSignals);
    const severity = computeSeverity(networkFailures, consoleErrors, perfIssues);
    const suggestions = buildFixSuggestions(networkFailures, consoleErrors, perfIssues);

    return {
        metadata: session.metadata,
        steps,
        networkFailures,
        apiErrors,
        slowApis,
        consoleErrors,
        bugSignals,
        performance: perfIssues,
        suggestions,
        rootCause,
        severity,
        capturedAt: session.endedAt,
    };
}

function deriveRootCause(networkFailures, consoleErrors, bugSignals) {
    if (networkFailures.length) {
        const failure = networkFailures[0];
        return `API failure ${failure.data?.status} on ${failure.data?.method || "GET"} ${
            failure.data?.url || ""
        }`;
    }
    if (consoleErrors.length) {
        return consoleErrors[0].data?.message || "Console error detected";
    }
    if (bugSignals.length) {
        return bugSignals[0].data?.kind || "Bug signal captured";
    }
    return "No dominant root cause detected";
}

function computeSeverity(networkFailures, consoleErrors, perfIssues) {
    if (networkFailures.some((f) => (f.data?.status || 0) >= 500)) return "Critical";
    if (consoleErrors.length > 3 || perfIssues.some((p) => p.type === "perf_longtask")) return "High";
    if (networkFailures.length || consoleErrors.length) return "Moderate";
    return "Low";
}

function buildFixSuggestions(networkFailures, consoleErrors, perfIssues) {
    const suggestions = [];
    if (networkFailures.length) {
        suggestions.push("Inspect backend responses for failing endpoints and retry logic.");
    }
    if (consoleErrors.length) {
        suggestions.push("Reproduce console errors locally and add guards around failing code.");
    }
    if (perfIssues.some((p) => p.type === "perf_longtask")) {
        suggestions.push("Break up long running tasks to keep UI responsive.");
    }
    if (!suggestions.length) {
        suggestions.push("Review captured steps and logs for potential regressions.");
    }
    return suggestions;
}
