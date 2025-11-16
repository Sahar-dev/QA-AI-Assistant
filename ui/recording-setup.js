import { showToast, copyToClipboard, downloadFile } from "../core/utils.js";

let recordingState = {
    isRecording: false,
    eventCount: 0,
    startTime: null,
};

const timelineState = {
    sessions: [],
    activeSession: null,
    selectedSessionId: null,
};

let timelineEnabled = false;
let selectedMode = "test";
const MODE_COPY = {
    test: {
        title: "Test Recording",
        subtitle: "Deterministic test scripts",
    },
    explore: {
        title: "Exploratory",
        subtitle: "Flow insights & summaries",
    },
    bug: {
        title: "Bug Hunt",
        subtitle: "Deep diagnostics bundle",
    },
};

// ===== TEST RECORDING (NEW) =====
export async function setupRecording() {
    const startBtn = document.getElementById("start-recording");
    const stopBtn = document.getElementById("stop-recording");
    const frameworkSelect = document.getElementById("framework-select");
    const generateCodeBtn = document.getElementById("generate-code-btn");
    const exploreSummaryBtn = document.getElementById("generate-explore-summary-btn");
    const bugBundleBtn = document.getElementById("export-bug-bundle-btn");
    const bugVideoBtn = document.getElementById("toggle-bug-video-btn");
    chrome.storage.local.get({ bugVideoCapture: false }, (data) => {
        if (bugVideoBtn) {
            const enabled = !!data.bugVideoCapture;
            bugVideoBtn.dataset.enabled = enabled.toString();
            bugVideoBtn.innerHTML = enabled
                ? `<i class="fas fa-video"></i> Video: On`
                : `<i class="fas fa-video"></i> Video: Off`;
        }
    });
    initModeToggle();

    // Start Recording
    startBtn?.addEventListener("click", async () => {
        const testName = document.getElementById("test-name")?.value || "Recorded Test";
        const testDesc = document.getElementById("test-description")?.value || "";

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const bugSettings = await chrome.storage.local.get({
                bugSlowThreshold: 500,
                bugCapturePayloads: true,
                bugVideoCapture: false,
            });
            const modeSettings =
                selectedMode === "bug"
                    ? {
                          slowThreshold: bugSettings.bugSlowThreshold || 500,
                          capturePayloads: !!bugSettings.bugCapturePayloads,
                          videoCapture: !!bugSettings.bugVideoCapture,
                      }
                    : {};
            const response = await chrome.runtime.sendMessage({
                action: "startRecordingSession",
                metadata: {
                    testName,
                    testDescription: testDesc,
                    startUrl: tab.url,
                    mode: selectedMode,
                    modeSettings,
                },
            });

            if (response?.success) {
                recordingState.isRecording = true;
                recordingState.startTime = Date.now();
                recordingState.eventCount = 0;
                updateRecordingUI();
                showToast("�YZ� Recording started!", "success");

                await refreshSessionTimeline(true);
                startEventCounter();
            }
        } catch (error) {
            console.error(error);
            showToast("Failed to start recording", "error");
        }
    });

    // Stop Recording
    stopBtn?.addEventListener("click", async () => {
        try {
            const response = await chrome.runtime.sendMessage({
                action: "stopRecordingSession",
            });

            if (response?.success) {
                recordingState.isRecording = false;
                updateRecordingUI();
                const events = response.data || response.events || [];
                showToast(`�Y>' Recording stopped! Captured ${events.length} events`, "success");
                document.getElementById("framework-selection")?.classList.remove("hidden");
                await refreshSessionTimeline(true);
            }
        } catch (error) {
            console.error(error);
            showToast("Failed to stop recording", "error");
        }
    });

    // Load saved preferences
    chrome.storage.local.get(
        ["keepAllAttempts", "includeNetwork", "includeAssertions", "includeHovers", "includeScrolls"],
        (data) => {
            document.getElementById("keep-all-attempts-toggle").checked = data.keepAllAttempts ?? false;
            document.getElementById("include-network-toggle").checked = data.includeNetwork ?? false;
            document.getElementById("include-assertions-toggle").checked = data.includeAssertions ?? true;
            document.getElementById("include-hovers-toggle").checked = data.includeHovers ?? false;
            document.getElementById("include-scrolls-toggle").checked = data.includeScrolls ?? false;
        }
    );

    const savePreference = (key, element) => {
        element?.addEventListener("change", (e) => {
            chrome.storage.local.set({ [key]: e.target.checked });
        });
    };

    savePreference("keepAllAttempts", document.getElementById("keep-all-attempts-toggle"));
    savePreference("includeNetwork", document.getElementById("include-network-toggle"));
    savePreference("includeAssertions", document.getElementById("include-assertions-toggle"));
    savePreference("includeHovers", document.getElementById("include-hovers-toggle"));
    savePreference("includeScrolls", document.getElementById("include-scrolls-toggle"));

    // Preset Buttons
    document.getElementById("preset-basic")?.addEventListener("click", () => {
        document.getElementById("keep-all-attempts-toggle").checked = false;
        document.getElementById("include-network-toggle").checked = false;
        document.getElementById("include-assertions-toggle").checked = true;
        document.getElementById("include-hovers-toggle").checked = false;
        document.getElementById("include-scrolls-toggle").checked = false;

        chrome.storage.local.set({
            keepAllAttempts: false,
            includeNetwork: false,
            includeAssertions: true,
            includeHovers: false,
            includeScrolls: false,
        });

        showToast("�o. Basic preset applied", "success");
    });

    document.getElementById("preset-comprehensive")?.addEventListener("click", () => {
        document.getElementById("keep-all-attempts-toggle").checked = true;
        document.getElementById("include-network-toggle").checked = true;
        document.getElementById("include-assertions-toggle").checked = true;
        document.getElementById("include-hovers-toggle").checked = true;
        document.getElementById("include-scrolls-toggle").checked = true;

        chrome.storage.local.set({
            keepAllAttempts: true,
            includeNetwork: true,
            includeAssertions: true,
            includeHovers: true,
            includeScrolls: true,
        });

        showToast("�o. Comprehensive preset applied", "success");
    });

    document.getElementById("preset-minimal")?.addEventListener("click", () => {
        document.getElementById("keep-all-attempts-toggle").checked = false;
        document.getElementById("include-network-toggle").checked = false;
        document.getElementById("include-assertions-toggle").checked = false;
        document.getElementById("include-hovers-toggle").checked = false;
        document.getElementById("include-scrolls-toggle").checked = false;

        chrome.storage.local.set({
            keepAllAttempts: false,
            includeNetwork: false,
            includeAssertions: false,
            includeHovers: false,
            includeScrolls: false,
        });

        showToast("�o. Minimal preset applied", "success");
    });

    // Generate code handler
    generateCodeBtn?.addEventListener("click", async () => {
        const framework = frameworkSelect?.value || "cypress";
        const codeCard = document.getElementById("code-output-card");
        const codeOutput = document.getElementById("code-output");

        const prefs = await chrome.storage.local.get([
            "keepAllAttempts",
            "includeNetwork",
            "includeAssertions",
            "includeHovers",
            "includeScrolls",
        ]);

        const options = {
            keepAllAttempts: prefs.keepAllAttempts ?? false,
            includeNetworkCalls: prefs.includeNetwork ?? false,
            includeAssertions: prefs.includeAssertions ?? true,
            includeHovers: prefs.includeHovers ?? false,
            includeScrolls: prefs.includeScrolls ?? false,
        };

        codeCard.classList.remove("hidden");
        codeOutput.innerHTML = '<div class="loading"><div class="spinner"></div> Generating test code...</div>';

        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        action: "generateAutomatedTest",
                        framework,
                        options,
                    },
                    (res) => {
                        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                        else resolve(res);
                    }
                );
            });

            if (response?.success) {
                codeOutput.textContent = response.code;
                showToast("�o� Test code generated!", "success");
                setTimeout(loadSavedTests, 500);
            } else {
                throw new Error(response?.error || "Unknown error");
            }
        } catch (error) {
            codeOutput.textContent = `Error: ${error.message}`;
            showToast("Generation failed", "error");
        }
    });

    // Copy generated code
    document.getElementById("copy-code-btn")?.addEventListener("click", () => {
        copyToClipboard("code-output");
    });

    // Download generated code
    document.getElementById("download-code-btn")?.addEventListener("click", () => {
        const code = document.getElementById("code-output").textContent;
        const framework = frameworkSelect?.value || "cypress";

        const extensions = {
            cypress: "cy.js",
            playwright: "spec.js",
            selenium: "java",
            puppeteer: "js",
        };

        downloadFile(code, `test.${extensions[framework]}`, "text/plain");
        showToast("Downloaded!", "success");
    });

    exploreSummaryBtn?.addEventListener("click", async () => {
        await requestExplorationSummary();
    });

    bugBundleBtn?.addEventListener("click", async () => {
        await exportBugBundle();
    });

    bugVideoBtn?.addEventListener("click", async () => {
        const enabled = bugVideoBtn.dataset.enabled === "true";
        bugVideoBtn.dataset.enabled = (!enabled).toString();
        bugVideoBtn.innerHTML = enabled
            ? `<i class="fas fa-video"></i> Video: Off`
            : `<i class="fas fa-video"></i> Video: On`;
        await chrome.storage.local.set({ bugVideoCapture: !enabled });
    });

    await initSessionTimeline();
    updateModeContext();
}

function updateRecordingUI() {
    const startBtn = document.getElementById("start-recording");
    const stopBtn = document.getElementById("stop-recording");
    const statusDisplay = document.getElementById("recording-status");

    if (recordingState.isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        const copy = MODE_COPY[selectedMode] || MODE_COPY.test;
        statusDisplay.textContent = `🟢 ${copy.title}: ${recordingState.eventCount} events`;
        statusDisplay.style.color = "#ef4444";
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusDisplay.textContent = "�s� Not recording";
        statusDisplay.style.color = "#64748b";
    }

    updateActiveTimelineCounter(recordingState.eventCount);
}

function startEventCounter() {
    const interval = setInterval(async () => {
        if (!recordingState.isRecording) {
            clearInterval(interval);
            return;
        }

        try {
            const response = await chrome.runtime.sendMessage({ action: "getRecordingState" });
            if (response?.success) {
                recordingState.eventCount = response.eventCount;
                updateRecordingUI();
            }
        } catch (error) {
            console.error("Failed to get recording state:", error);
        }
    }, 1000);
}

function initModeToggle() {
    const buttons = document.querySelectorAll(".mode-btn");
    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            buttons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            selectedMode = btn.dataset.mode || "test";
            updateModeContext();
        });
    });
}

function updateModeContext() {
    const generateCard = document.getElementById("framework-selection");
    const bugBundleCard = document.getElementById("bug-bundle-card");
    const exploratoryCard = document.getElementById("explore-summary-card");

    if (selectedMode === "test") {
        generateCard?.classList.remove("hidden");
        bugBundleCard?.classList.add("hidden");
        exploratoryCard?.classList.add("hidden");
    } else if (selectedMode === "explore") {
        generateCard?.classList.add("hidden");
        bugBundleCard?.classList.add("hidden");
        exploratoryCard?.classList.remove("hidden");
    } else {
        generateCard?.classList.add("hidden");
        bugBundleCard?.classList.remove("hidden");
        exploratoryCard?.classList.add("hidden");
    }

    const statusDisplay = document.getElementById("recording-status");
    if (!recordingState.isRecording && statusDisplay) {
        const copy = MODE_COPY[selectedMode] || MODE_COPY.test;
        statusDisplay.textContent = `⚪ Not recording (${copy.title})`;
    }
}

async function initSessionTimeline() {
    const historyList = document.getElementById("session-history-list");
    const eventsContainer = document.getElementById("session-timeline-events");
    if (!historyList || !eventsContainer) return;

    timelineEnabled = true;

    historyList.addEventListener("click", handleSessionListClick);
    document.getElementById("refresh-timeline-btn")?.addEventListener("click", () => refreshSessionTimeline(true));
    document.getElementById("download-session-btn")?.addEventListener("click", downloadCurrentSession);
    document.getElementById("resume-session-btn")?.addEventListener("click", handleResumeClick);

    await refreshSessionTimeline(true);
}

async function refreshSessionTimeline(autoSelectLatest = false) {
    if (!timelineEnabled) return;

    try {
        const [historyRes, activeRes] = await Promise.all([
            chrome.runtime.sendMessage({ action: "getSessionHistory" }),
            chrome.runtime.sendMessage({ action: "getActiveSession" }),
        ]);

        timelineState.sessions = historyRes?.sessions || [];
        timelineState.activeSession = activeRes?.session || null;

        const availableIds = new Set(timelineState.sessions.map((s) => s.id));
        if (timelineState.activeSession?.id) {
            availableIds.add(timelineState.activeSession.id);
        }

        if (
            autoSelectLatest ||
            !timelineState.selectedSessionId ||
            !availableIds.has(timelineState.selectedSessionId)
        ) {
            timelineState.selectedSessionId =
                timelineState.activeSession?.id || timelineState.sessions[0]?.id || null;
        }

        renderActiveSessionBanner();
        renderSessionHistory();
        renderTimelineEvents();
    } catch (error) {
        console.error("Failed to load session timeline:", error);
        showToast("Failed to load session history", "error");
    }
}

function renderActiveSessionBanner() {
    if (!timelineEnabled) return;
    const banner = document.getElementById("active-session-banner");
    const resumeBtn = document.getElementById("resume-session-btn");
    if (!banner) return;

    const session = timelineState.activeSession;
    if (!session) {
        banner.innerHTML = `<div class="timeline-empty">No live recording detected. Resume becomes available if a recording was interrupted (e.g., DevTools refresh) while it was running.</div>`;
        if (resumeBtn) resumeBtn.disabled = true;
        updateActiveTimelineCounter(0);
        return;
    }

    const count = recordingState.isRecording
        ? recordingState.eventCount
        : session.events?.length || 0;
    const started =
        session.metadata?.startedAt
            ? new Date(session.metadata.startedAt).toLocaleString()
            : "Just now";

    banner.innerHTML = `
        <div class="active-session-title">
            <strong>${sanitizeText(session.metadata?.testName || "Untitled Session")}</strong>
            <span class="badge badge-live">LIVE</span>
        </div>
        <div class="active-session-meta">
            Started ${started} · <span id="active-session-event-count">${count}</span> events
        </div>
        <div class="active-session-description">
            ${sanitizeText(session.metadata?.testDescription || "Actions are being tracked in real-time.")}
        </div>
    `;

    if (resumeBtn) resumeBtn.disabled = recordingState.isRecording;
    updateActiveTimelineCounter(count);
}

function renderSessionHistory() {
    if (!timelineEnabled) return;
    const container = document.getElementById("session-history-list");
    if (!container) return;

    if (!timelineState.sessions.length) {
        container.innerHTML = `<div class="output-empty">No completed sessions yet.</div>`;
        return;
    }

    container.innerHTML = timelineState.sessions
        .map((session) => {
            const isActive = session.id === timelineState.selectedSessionId;
            const started = formatDateShort(session.metadata?.startedAt);
            const duration = formatDuration(session.metadata?.startedAt, session.endedAt);
            const events = session.events?.length || 0;
            return `
                <div class="session-history-item ${isActive ? "active" : ""}" data-session-id="${session.id}">
                    <div class="session-history-info">
                        <div class="session-history-title">${sanitizeText(session.metadata?.testName || "Untitled Session")}</div>
                        <div class="session-history-meta">
                            ${started} · ${events} steps${duration ? ` · ${duration}` : ""}
                        </div>
                    </div>
                    <button class="session-delete-btn" data-session-id="${session.id}" title="Delete session">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        })
        .join("");
}

function renderTimelineEvents() {
    if (!timelineEnabled) return;
    const container = document.getElementById("session-timeline-events");
    const downloadBtn = document.getElementById("download-session-btn");
    if (!container) return;

    const session = getSelectedTimelineSession();
    if (!session) {
        container.innerHTML = `<div class="output-empty">Select a session to inspect its steps.</div>`;
        if (downloadBtn) downloadBtn.disabled = true;
        return;
    }

    const events = session.events || [];
    if (!events.length) {
        container.innerHTML = `<div class="output-empty">This session has no recorded events.</div>`;
        if (downloadBtn) downloadBtn.disabled = false;
        return;
    }

    const baseTime = events[0]?.t || session.metadata?.startedAt || Date.now();
    container.innerHTML = events
        .map((ev, index) => {
            const offset = formatOffset(ev.t || baseTime, baseTime);
            return `
                <div class="timeline-event">
                    <div class="timeline-event-index">#${index + 1}</div>
                    <div class="timeline-event-body">
                        <div class="timeline-event-title">${sanitizeText(ev.type?.toUpperCase() || "EVENT")}</div>
                        <div class="timeline-event-desc">${describeTimelineEvent(ev)}</div>
                        <div class="timeline-event-meta">${offset}</div>
                    </div>
                </div>
            `;
        })
        .join("");

    if (downloadBtn) downloadBtn.disabled = false;
}

function describeTimelineEvent(ev = {}) {
    const data = ev.data || {};
    switch (ev.type) {
        case "click":
            return `Clicked ${sanitizeText(data.text || data.selector || "element")}`;
        case "input":
            return `Filled ${sanitizeText(data.selector || "field")} with "${sanitizeText(data.value || "")}"`;
        case "navigation":
            return `Navigated to ${sanitizeText(data.href || ev.url || "new location")}`;
        case "fetch":
            return `${sanitizeText(data.method || "GET")} ${sanitizeText(data.url || "")} (${data.status || "pending"})`;
        case "assertion":
            return `Assertion: ${sanitizeText(data.text || data.type || "value visible")}`;
        case "error":
            return `Error: ${sanitizeText(data.message || "Unexpected issue")}`;
        default:
            return sanitizeText(data.text || JSON.stringify(data).slice(0, 60) || "Recorded event");
    }
}

function sanitizeText(value = "") {
    return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDateShort(timestamp) {
    if (!timestamp) return "Unknown date";
    return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(start, end) {
    if (!start || !end) return "";
    const diffMs = Math.max(0, end - start);
    const seconds = Math.round(diffMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
}

function formatOffset(current, base) {
    const diff = Math.max(0, current - base);
    return `+${(diff / 1000).toFixed(1)}s`;
}

function getSelectedTimelineSession() {
    if (!timelineState.selectedSessionId) return null;
    if (timelineState.activeSession?.id === timelineState.selectedSessionId) {
        return timelineState.activeSession;
    }
    return timelineState.sessions.find((session) => session.id === timelineState.selectedSessionId) || null;
}

function updateActiveTimelineCounter(count) {
    if (!timelineEnabled) return;
    const counter = document.getElementById("active-session-event-count");
    if (!counter) return;
    counter.textContent = typeof count === "number" && count >= 0 ? count : "--";
}

function downloadCurrentSession() {
    const session = getSelectedTimelineSession();
    if (!session) {
        showToast("Select a session to download", "warning");
        return;
    }
    const slug = (session.metadata?.testName || "session")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const filename = `${slug || "session"}-${session.id}.json`;
    downloadFile(JSON.stringify(session, null, 2), filename, "application/json");
    showToast("Session exported", "success");
}

function handleSessionListClick(event) {
    const deleteBtn = event.target.closest(".session-delete-btn");
    if (deleteBtn) {
        event.stopPropagation();
        const sessionId = deleteBtn.dataset.sessionId;
        if (sessionId) {
            deleteSessionFromHistory(sessionId);
        }
        return;
    }
    handleSessionSelection(event);
}

function handleSessionSelection(event) {
    const target = event.target.closest(".session-history-item[data-session-id]");
    if (!target) return;
    const sessionId = target.getAttribute("data-session-id");
    if (!sessionId || timelineState.selectedSessionId === sessionId) return;
    timelineState.selectedSessionId = sessionId;
    renderSessionHistory();
    renderTimelineEvents();
}

async function deleteSessionFromHistory(sessionId) {
    if (!sessionId) return;
    const confirmed = window.confirm("Delete this recorded session? This cannot be undone.");
    if (!confirmed) return;

    try {
        const response = await chrome.runtime.sendMessage({ action: "deleteSession", sessionId });
        if (response?.success) {
            showToast("Session deleted", "success");
            timelineState.selectedSessionId = null;
            await refreshSessionTimeline(true);
        } else {
            showToast(response?.error || "Failed to delete session", "error");
        }
    } catch (error) {
        console.error("Delete session failed:", error);
        showToast("Failed to delete session", "error");
    }
}

async function handleResumeClick() {
    if (recordingState.isRecording) return;
    const button = document.getElementById("resume-session-btn");
    if (!timelineState.activeSession) {
        showToast("No active session to resume", "warning");
        return;
    }
    if (button) button.disabled = true;

    try {
        const response = await chrome.runtime.sendMessage({ action: "resumeRecordingSession" });
        if (response?.success) {
            recordingState.isRecording = true;
            recordingState.eventCount = timelineState.activeSession.events?.length || 0;
            updateRecordingUI();
            showToast("Recording resumed", "success");
            startEventCounter();
        } else {
            showToast(response?.error || "Unable to resume session", "error");
        }
    } catch (error) {
        console.error("Failed to resume recording:", error);
        showToast("Failed to resume recording", "error");
    } finally {
        await refreshSessionTimeline();
        if (button) button.disabled = recordingState.isRecording || !timelineState.activeSession;
    }
}

async function requestExplorationSummary() {
    const summaryOutput = document.getElementById("explore-summary-output");
    if (!summaryOutput) return;
    summaryOutput.innerHTML = `<div class="loading"><div class="spinner"></div> Generating insights...</div>`;
    try {
        const response = await chrome.runtime.sendMessage({ action: "generateExploratorySummary" });
        if (response?.success) {
            const stats = response.stats || {};
            const flowsHtml = stats.flows
                ? `<div class="summary-section"><strong>Flows:</strong> ${Object.entries(stats.flows)
                      .map(([name, count]) => `${name} (${count})`)
                      .join(", ")}</div>`
                : "";
            const slowHtml = stats.slowComponents?.length
                ? `<div class="summary-section"><strong>Slow components:</strong><br>${stats.slowComponents
                      .slice(0, 5)
                      .join("<br>")}</div>`
                : "";
            const repeatedHtml = stats.repeatedAttempts?.length
                ? `<div class="summary-section"><strong>Repeated attempts:</strong><br>${stats.repeatedAttempts
                      .slice(0, 5)
                      .join("<br>")}</div>`
                : "";
            summaryOutput.innerHTML = response.summary
                ? `<pre>${response.summary}</pre>${flowsHtml}${slowHtml}${repeatedHtml}`
                : `<div class="output-empty">No insights generated.</div>`;
        } else {
            throw new Error(response?.error || "Failed to generate summary");
        }
    } catch (error) {
        console.error(error);
        summaryOutput.innerHTML = `<div class="output-empty">${error.message}</div>`;
    }
}

async function exportBugBundle() {
    try {
        const response = await chrome.runtime.sendMessage({ action: "exportBugBundle" });
        if (response?.success && response.bundle) {
            downloadFile(JSON.stringify(response.bundle, null, 2), "bug-bundle.json", "application/json");
            showToast("Bug bundle exported", "success");
            const bundleOutput = document.getElementById("bug-bundle-output");
            if (bundleOutput) {
                bundleOutput.innerHTML = renderBugBundleInsights(response.bundle);
            }
        } else {
            throw new Error(response?.error || "Failed to export bundle");
        }
    } catch (error) {
        showToast(error.message, "error");
    }
}

function renderBugBundleInsights(bundle = {}) {
    if (!bundle || typeof bundle !== "object") {
        return `<div class="output-empty">No bundle data available.</div>`;
    }

    const severityLabel = bundle.severity || "Unknown";
    const severitySlug = severityLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const decision = sanitizeText(bundle.shipDecision || "Review required");
    const summary = sanitizeText(bundle.summary || "No diagnostic summary available.").replace(/\n/g, "<br>");
    const rootCause = sanitizeText(bundle.rootCause || "No dominant root cause detected");
    const overview = bundle.overview || {};

    const stabilityValue =
        typeof bundle.stabilityScore === "number"
            ? `${Math.max(0, Math.round(bundle.stabilityScore))}%`
            : "--";

    const metrics = [
        { label: "Steps", value: overview.totalSteps ?? bundle.steps?.length ?? 0 },
        { label: "Pages", value: overview.pagesTouched ?? "--" },
        { label: "Console Errors", value: overview.consoleErrorCount ?? (bundle.consoleErrors?.length ?? 0) },
        { label: "Failed APIs", value: overview.networkFailureCount ?? (bundle.networkFailures?.length ?? 0) },
        { label: "Slow APIs", value: overview.slowApiCount ?? (bundle.slowApis?.length ?? 0) },
        { label: "Perf Alerts", value: overview.perfAlertCount ?? (bundle.performance?.length ?? 0) },
        { label: "Stability", value: stabilityValue },
    ];

    const metricsHtml = metrics
        .map(
            (metric) => `
            <div class="bug-diagnostic-card">
                <div class="value">${sanitizeText(String(metric.value))}</div>
                <div class="label">${sanitizeText(metric.label)}</div>
            </div>`
        )
        .join("");

    const hotSignals = bundle.hotSignals || [];
    const hotSignalsHtml = hotSignals.length
        ? hotSignals
              .slice(0, 4)
              .map((signal) => {
                  const title = sanitizeText(signal.title || "Signal");
                  const detail = sanitizeText(signal.detail || "");
                  const highlight = signal.highlight ? ` <span class="hot-highlight">${sanitizeText(signal.highlight)}</span>` : "";
                  return `<li><strong>${title}:</strong> ${detail}${highlight}</li>`;
              })
              .join("")
        : "<li>No critical signals captured.</li>";

    const riskAreas = bundle.riskAreas || [];
    const riskHtml = riskAreas.length
        ? riskAreas.map((risk) => `<span class="risk-chip">${sanitizeText(risk)}</span>`).join("")
        : '<span class="risk-chip">No dominant risks</span>';

    const reproduction = bundle.reproduction || [];
    const reproductionHtml = reproduction.length
        ? reproduction.map((step) => `<li>${sanitizeText(step)}</li>`).join("")
        : "<li>No steps recorded.</li>";

    const suggestions = bundle.suggestions || [];
    const suggestionsHtml = suggestions.length
        ? suggestions.map((tip) => `<li>${sanitizeText(tip)}</li>`).join("")
        : "<li>No automated recommendations.</li>";

    return `
        <div class="bug-summary">
            <div class="bug-summary-header">
                <span class="bug-severity-chip severity-${sanitizeText(severitySlug)}">${sanitizeText(severityLabel)}</span>
                <span class="bug-decision">${decision}</span>
            </div>
            <p>${summary}</p>
            <div class="bug-summary-meta"><strong>Root cause:</strong> ${rootCause}</div>
        </div>
        <div class="bug-diagnostic-grid">
            ${metricsHtml}
        </div>
        <div class="bug-section">
            <div class="bug-section-title">Hot Signals</div>
            <ul class="bug-list">
                ${hotSignalsHtml}
            </ul>
        </div>
        <div class="bug-section">
            <div class="bug-section-title">Risk Areas</div>
            <div class="risk-chip-row">
                ${riskHtml}
            </div>
        </div>
        <div class="bug-section">
            <div class="bug-section-title">Reproduction Steps</div>
            <ol class="bug-steps">
                ${reproductionHtml}
            </ol>
        </div>
        <div class="bug-section">
            <div class="bug-section-title">Recommended Fixes</div>
            <ul class="bug-list">
                ${suggestionsHtml}
            </ul>
        </div>
    `;
}
