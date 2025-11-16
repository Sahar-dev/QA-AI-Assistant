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
let activeRecordingTabId = null;

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
    if (!activeRecordingTabId) return;
    try {
        await chrome.tabs.sendMessage(activeRecordingTabId, {
            action: "startRecording",
            sessionId,
            resume,
            mode: recordedEvents.metadata?.mode || "test",
            modeSettings: recordedEvents.metadata?.modeSettings || {},
        });
        console.log("�o. Recording flag sent to tab:", activeRecordingTabId);
    } catch (err) {
        console.warn("�s���? Failed to toggle recording on tab:", activeRecordingTabId, err);
    }
}

async function notifyTabsStop() {
    if (!activeRecordingTabId) return;
    try {
        await chrome.tabs.sendMessage(activeRecordingTabId, { action: "stopRecording" });
    } catch (err) {
        console.warn("�s���? Failed to stop recording on tab:", activeRecordingTabId, err);
    }
}

export async function startRecordingSession(metadata = {}) {
    await sessionPersistenceReady;

    if (sessionId) {
        await archiveActiveSession("restarted", { discardIfEmpty: true });
    }

    const targetTab = await getFocusedTab();
    if (!targetTab?.id) {
        throw new Error("No active tab available to record.");
    }

    sessionId = crypto.randomUUID();
    const sessionMeta = {
        ...metadata,
        sessionId,
        startedAt: Date.now(),
        targetTabId: targetTab.id,
    };
    activeRecordingTabId = targetTab.id;

    await createActiveSession(sessionMeta);
    isRecording = true;

    await ensureRecorderInjected(activeRecordingTabId);

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
    activeRecordingTabId = null;

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
    activeRecordingTabId = recordedEvents.metadata?.targetTabId || null;
    if (!activeRecordingTabId) {
        const focused = await getFocusedTab();
        activeRecordingTabId = focused?.id || null;
    }
    if (activeRecordingTabId) {
        await ensureRecorderInjected(activeRecordingTabId);
    }

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
                startRecordingSession(req.metadata || {})
                    .then(sendResponse)
                    .catch((err) => {
                        console.error("startRecordingSession failed", err);
                        sendResponse({ success: false, error: err.message });
                    });
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
    const steps = buildBundleSteps(events);
    const networkFailures = events.filter(
        (ev) => ev.type === "fetch" && (ev.data?.status || 0) >= 400
    );
    const apiErrors = events.filter((ev) => ev.type === "fetch_error");
    const slowApis = events.filter((ev) => ev.type === "slow_fetch");
    const consoleErrors = events.filter((ev) => ev.type === "error");
    const consoleWarnings = events.filter((ev) => ev.type === "console_warn");
    const bugSignals = events.filter((ev) => ev.type === "bug_signal");
    const perfIssues = events.filter((ev) => ev.type === "perf_longtask");
    const fpsDrops = events.filter((ev) => ev.type === "fps_drop");
    const layoutShifts = events.filter((ev) => ev.type === "layout_shift");
    const visualChanges = events.filter((ev) => ev.type === "visual_change");
    const bugSnapshot =
        [...events].reverse().find((ev) => ev.type === "bug_snapshot")?.data || null;

    const diagnostics = analyzeBugDiagnostics({
        session,
        events,
        steps,
        networkFailures,
        apiErrors,
        slowApis,
        consoleErrors,
        consoleWarnings,
        bugSignals,
        perfIssues,
        fpsDrops,
        layoutShifts,
        visualChanges,
        bugSnapshot,
    });

    const rootCause = deriveRootCause(diagnostics);
    const severityProfile = computeSeverityProfile(diagnostics, rootCause);
    const suggestions = buildFixSuggestions(diagnostics);

    return {
        metadata: session.metadata,
        summary: diagnostics.summary,
        overview: diagnostics.overview,
        steps,
        reproduction: diagnostics.reproduction,
        networkFailures,
        apiErrors,
        slowApis,
        consoleErrors,
        consoleWarnings,
        runtimeErrors: diagnostics.runtimeErrors,
        bugSignals,
        performance: diagnostics.performanceIssues,
        visualChanges,
        fpsDrops,
        layoutShifts,
        hotSignals: diagnostics.hotSignals,
        riskAreas: diagnostics.riskAreas,
        evidence: diagnostics.evidence,
        stabilityScore: severityProfile.score,
        severity: severityProfile.severity,
        shipDecision: severityProfile.decision,
        rootCause,
        suggestions,
        capturedAt: session.endedAt,
        snapshot: diagnostics.snapshot,
    };
}

const STEP_EVENT_TYPES = new Set([
    "click",
    "input",
    "navigation",
    "form_submit",
    "drag_drop",
    "hover",
]);

function buildBundleSteps(events = []) {
    const steps = [];
    for (const ev of events) {
        if (!STEP_EVENT_TYPES.has(ev.type)) continue;
        const step = {
            type: ev.type,
            selector: ev.data?.selector,
            text: ev.data?.text,
            url: ev.data?.href || ev.url,
            timestamp: ev.timestamp,
        };
        const prev = steps[steps.length - 1];
        if (
            prev &&
            prev.type === step.type &&
            prev.selector === step.selector &&
            prev.text === step.text &&
            Math.abs((step.timestamp || 0) - (prev.timestamp || 0)) < 80
        ) {
            continue;
        }
        steps.push(step);
    }
    return steps;
}

function analyzeBugDiagnostics({
    session,
    events = [],
    steps = [],
    networkFailures = [],
    apiErrors = [],
    slowApis = [],
    consoleErrors = [],
    consoleWarnings = [],
    bugSignals = [],
    perfIssues = [],
    fpsDrops = [],
    layoutShifts = [],
    visualChanges = [],
    bugSnapshot = null,
}) {
    const urls = new Set(steps.map((s) => s.url).filter(Boolean));
    const selectors = new Set(steps.map((s) => s.selector).filter(Boolean));
    const fetchEvents = events.filter((ev) => ev.type === "fetch");
    const uniqueApis = new Set(
        fetchEvents.map((ev) => ev.data?.url || ev.data?.request?.url).filter(Boolean)
    );
    const durationMs = Math.max(
        0,
        (session.endedAt || Date.now()) - (session.metadata?.startedAt || steps[0]?.timestamp || Date.now())
    );
    const runtimeErrors = [
        ...(bugSnapshot?.runtimeErrors || []),
        ...bugSignals
            .filter((sig) => sig.data?.kind === "runtime_error")
            .map((sig) => ({
                message: sig.data?.message,
                source: sig.data?.source,
                line: sig.data?.line,
                column: sig.data?.column,
                timestamp: sig.timestamp,
            })),
    ];
    const performanceIssues = [...perfIssues, ...fpsDrops, ...layoutShifts];

    const overview = {
        totalEvents: events.length,
        totalSteps: steps.length,
        pagesTouched: urls.size || 1,
        durationMs,
        uniqueSelectors: selectors.size,
        apisTouched: uniqueApis.size,
        consoleErrorCount: consoleErrors.length,
        consoleWarnCount: consoleWarnings.length,
        networkFailureCount: networkFailures.length,
        slowApiCount: slowApis.length,
        perfAlertCount: performanceIssues.length,
    };

    const reproduction = buildReproductionSteps(steps);
    const summaryParts = [
        `Bug hunt captured ${steps.length || 0} interaction steps across ${overview.pagesTouched} view(s) in ${formatDurationLabel(durationMs)}.`,
    ];
    const topError = getTopOccurrence(consoleErrors, (ev) => ev.data?.message);
    if (consoleErrors.length) {
        summaryParts.push(
            `${consoleErrors.length} console error(s) surfaced${topError ? ` (top: ${topError.key})` : ""}.`
        );
    }
    if (networkFailures.length) {
        summaryParts.push(
            `${networkFailures.length} API failure(s) observed, starting with ${formatEndpoint(networkFailures[0])}.`
        );
    }
    if (performanceIssues.length) {
        summaryParts.push(
            `${performanceIssues.length} performance warnings (long tasks, layout shifts, or FPS drops) detected.`
        );
    }
    if (!consoleErrors.length && !networkFailures.length && !performanceIssues.length) {
        summaryParts.push("No blocking signals captured, but manual verification is still recommended.");
    }
    const summary = summaryParts.join(" ");

    const hotSignals = [];
    if (consoleErrors.length) {
        hotSignals.push({
            title: "Console Errors",
            detail: `${consoleErrors.length} occurrences`,
            highlight: topError?.key || consoleErrors[0].data?.message,
        });
    }
    if (networkFailures.length) {
        hotSignals.push({
            title: "Failed APIs",
            detail: formatEndpoint(networkFailures[0]),
            highlight: `${networkFailures.length} endpoints impacted`,
        });
    }
    if (slowApis.length) {
        const slowest = slowApis.reduce(
            (acc, ev) => (!acc || (ev.data?.timeMs || 0) > (acc.data?.timeMs || 0) ? ev : acc),
            null
        );
        if (slowest) {
            hotSignals.push({
                title: "Slow API",
                detail: `${slowest.data?.method || "GET"} ${truncate(slowest.data?.url || "", 60)}`,
                highlight: `${slowest.data?.timeMs || 0}ms`,
            });
        }
    }
    if (visualChanges.length) {
        hotSignals.push({
            title: "UI Instability",
            detail: `Visual changes on ${visualChanges[0].data?.selector || "unknown element"}`,
            highlight: `${visualChanges.length} change(s)`,
        });
    }
    if (!hotSignals.length && consoleWarnings.length) {
        hotSignals.push({
            title: "Warnings",
            detail: `${consoleWarnings.length} console warning(s)`,
            highlight: consoleWarnings[0].data?.message || "Review warnings",
        });
    }
    if (!hotSignals.length) {
        hotSignals.push({
            title: "Signals",
            detail: "No blocking signals captured",
            highlight: "Manual QA review recommended",
        });
    }

    const riskAreas = [];
    if (networkFailures.length) riskAreas.push(`API: ${formatEndpoint(networkFailures[0])}`);
    if (consoleErrors.length) riskAreas.push(`Script: ${truncate(consoleErrors[0].data?.source || "unknown", 60)}`);
    if (visualChanges.length) riskAreas.push(`UI: ${visualChanges[0].data?.selector || "layout shift"}`);
    if (!riskAreas.length) riskAreas.push("No dominant risk areas captured");

    const evidence = {
        console: consoleErrors.slice(0, 5).map((err) => ({
            message: err.data?.message,
            source: err.data?.source,
            line: err.data?.line,
        })),
        network: networkFailures.slice(0, 5).map((failure) => ({
            endpoint: formatEndpoint(failure),
            status: failure.data?.status,
        })),
        performance: performanceIssues.slice(0, 5).map((issue) => issue.type || "performance"),
    };

    return {
        summary,
        overview,
        reproduction,
        runtimeErrors,
        hotSignals,
        riskAreas,
        evidence,
        performanceIssues,
        snapshot: bugSnapshot,
        consoleErrors,
        consoleWarnings,
        networkFailures,
        apiErrors,
        slowApis,
        bugSignals,
        visualChanges,
    };
}

function buildReproductionSteps(steps = []) {
    if (!steps.length) return [];
    return steps.slice(0, 20).map((step, index) => describeBundleStep(step, index));
}

function describeBundleStep(step, index) {
    const prefix = `#${index + 1}`;
    const target = step.text || step.selector || step.url || step.type;
    switch (step.type) {
        case "click":
            return `${prefix} Click ${target}`;
        case "input":
            return `${prefix} Fill ${target}`;
        case "navigation":
            return `${prefix} Navigate to ${step.url || target}`;
        case "form_submit":
            return `${prefix} Submit form ${target}`;
        case "drag_drop":
            return `${prefix} Drag and drop via ${target}`;
        case "hover":
            return `${prefix} Hover over ${target}`;
        default:
            return `${prefix} ${step.type} ${target}`;
    }
}

function truncate(value = "", limit = 80) {
    if (!value) return "";
    return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function formatDurationLabel(ms = 0) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
}

function getTopOccurrence(list = [], selector = () => "") {
    const counts = new Map();
    for (const item of list) {
        const key = selector(item);
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    let top = null;
    for (const [key, count] of counts.entries()) {
        if (!top || count > top.count) {
            top = { key, count };
        }
    }
    return top;
}

function formatEndpoint(event = {}) {
    const method = event.data?.method || "GET";
    const rawUrl = event.data?.url || "";
    const status = event.data?.status;
    const shortUrl = truncate(rawUrl.replace(/^https?:\/\//, ""), 80);
    return `${method} ${shortUrl}${status ? ` (${status})` : ""}`;
}

function deriveRootCause(diagnostics = {}) {
    const failures = diagnostics.networkFailures || [];
    if (failures.length) {
        return `API failure ${formatEndpoint(failures[0])}`;
    }
    const runtimeErrors = diagnostics.runtimeErrors || [];
    if (runtimeErrors.length) {
        return runtimeErrors[0].message || "Runtime error detected";
    }
    const consoleErrors = diagnostics.consoleErrors || [];
    if (consoleErrors.length) {
        return consoleErrors[0].data?.message || "Console error detected";
    }
    const bugSignals = diagnostics.bugSignals || [];
    const specialSignal = bugSignals.find((sig) =>
        ["flapping_ui", "memory_spike", "api_failure"].includes(sig.data?.kind)
    );
    if (specialSignal) {
        return specialSignal.data?.kind?.replace(/_/g, " ") || "Bug signal captured";
    }
    const visualChanges = diagnostics.visualChanges || [];
    if (visualChanges.length) {
        return `Visual instability on ${visualChanges[0].data?.selector || "UI component"}`;
    }
    return "No dominant root cause detected";
}

function computeSeverityProfile(diagnostics = {}, rootCause = "") {
    const networkFailures = diagnostics.networkFailures || [];
    const slowApis = diagnostics.slowApis || [];
    const consoleErrors = diagnostics.consoleErrors || [];
    const consoleWarnings = diagnostics.consoleWarnings || [];
    const performanceIssues = diagnostics.performanceIssues || [];
    const visualChanges = diagnostics.visualChanges || [];
    const runtimeErrors = diagnostics.runtimeErrors || [];
    const bugSignals = diagnostics.bugSignals || [];

    let score = 100;
    const hasCriticalApi = networkFailures.some((f) => (f.data?.status || 0) >= 500);
    if (hasCriticalApi) score -= 35;
    else if (networkFailures.length) score -= 20;
    if (runtimeErrors.length) score -= 30;
    score -= Math.min(40, consoleErrors.length * 5);
    score -= Math.min(15, consoleWarnings.length * 2);
    score -= Math.min(20, slowApis.length * 3);
    score -= Math.min(20, performanceIssues.length * 2);
    if (visualChanges.length) score -= 10;
    if (bugSignals.some((sig) => ["memory_spike", "flapping_ui", "api_failure"].includes(sig.data?.kind))) {
        score -= 10;
    }
    score = Math.max(5, Math.min(100, score));

    let severity = "None";
    if (score < 95) {
        if (score >= 85) severity = "Low";
        else if (score >= 70) severity = "Moderate";
        else if (score >= 55) severity = "High";
        else severity = "Critical";
    }

    let decision = "?? REVIEW REQUIRED";
    if (score < 80 || runtimeErrors.length || hasCriticalApi) {
        decision = "? DO NOT SHIP";
    } else if (score >= 95 && !consoleErrors.length && !networkFailures.length) {
        decision = "? Low risk - Safe to ship";
    }

    return {
        score,
        severity,
        decision,
        rootCause,
    };
}

function buildFixSuggestions(diagnostics = {}) {
    const suggestions = [];
    const consoleErrors = diagnostics.consoleErrors || [];
    const networkFailures = diagnostics.networkFailures || [];
    const slowApis = diagnostics.slowApis || [];
    const performanceIssues = diagnostics.performanceIssues || [];
    const visualChanges = diagnostics.visualChanges || [];
    const consoleWarnings = diagnostics.consoleWarnings || [];
    const runtimeErrors = diagnostics.runtimeErrors || [];

    const topError = getTopOccurrence(consoleErrors, (err) => err.data?.message);
    if (topError) {
        suggestions.push(`Guard against "${topError.key}" by ensuring dependent assets load before execution.`);
    } else if (runtimeErrors.length) {
        suggestions.push("Add guards or retries around the failing runtime area to prevent crashes.");
    }
    if (networkFailures.length) {
        suggestions.push(`Stabilize ${formatEndpoint(networkFailures[0])} or add retries/fallback UI.`);
    }
    if (slowApis.length) {
        suggestions.push("Investigate the slow API calls flagged and optimize backend response times or UI loading states.");
    }
    if (performanceIssues.some((issue) => issue.type === "perf_longtask")) {
        suggestions.push("Break up long running tasks to keep the UI thread responsive.");
    }
    if (visualChanges.length) {
        suggestions.push(`Verify layout around ${visualChanges[0].data?.selector || "the changed element"} to ensure key components remain visible.`);
    }
    if (!suggestions.length && consoleWarnings.length) {
        suggestions.push("Review console warnings to prevent them from turning into runtime errors.");
    }
    if (!suggestions.length) {
        suggestions.push("Review captured steps and logs for potential regressions.");
    }
    return suggestions;
}
async function getFocusedTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function ensureRecorderInjected(tabId) {
    if (!tabId) return;
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["recording/recorder.js"],
        });
    } catch (err) {
        console.warn("Failed to inject recorder content script", err);
    }
}
