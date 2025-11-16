import { showToast } from "../core/utils.js";

const SNAPSHOT_KEY = "regressionSnapshots";
let snapshotsCache = [];

export async function setupAnalysis() {
    const captureBtn = document.getElementById("capture-regression-btn");
    const compareBtn = document.getElementById("compare-regression-btn");

    captureBtn?.addEventListener("click", handleCaptureSnapshot);
    compareBtn?.addEventListener("click", handleCompareSnapshots);

    await loadSnapshots();

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[SNAPSHOT_KEY]) {
            loadSnapshots();
        }
    });
}

async function handleCaptureSnapshot() {
    const captureBtn = document.getElementById("capture-regression-btn");
    const statusEl = document.getElementById("regression-status");

    if (!captureBtn) return;

    captureBtn.disabled = true;
    setStatus("Capturing live snapshot…");

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error("No active tab available");

        const response = await chrome.runtime.sendMessage({
            action: "captureRegressionSnapshot",
            tabId: tab.id,
        });

        if (response?.success) {
            showToast("Snapshot captured", "success");
            await loadSnapshots();
        } else {
            throw new Error(response?.error || "Snapshot capture failed");
        }
    } catch (error) {
        console.error("Snapshot capture failed:", error);
        showToast(error.message, "error");
        setStatus(error.message, true);
    } finally {
        captureBtn.disabled = false;
    }
}

async function handleCompareSnapshots() {
    const reportEl = document.getElementById("regression-report-output");
    if (!reportEl) return;

    reportEl.innerHTML = `<div class="loading"><div class="spinner"></div> Comparing snapshots...</div>`;

    try {
        const response = await chrome.runtime.sendMessage({ action: "compareRegressionSnapshots" });
        if (response?.success) {
            renderReport(response);
        } else {
            throw new Error(response?.error || "Comparison failed");
        }
    } catch (error) {
        console.error("Comparison failed:", error);
        reportEl.innerHTML = `<div class="output-empty">${error.message}</div>`;
        showToast(error.message, "error");
    }
}

async function loadSnapshots() {
    const data = await chrome.storage.local.get([SNAPSHOT_KEY]);
    snapshotsCache = Array.isArray(data[SNAPSHOT_KEY]) ? data[SNAPSHOT_KEY] : [];

    const latest = snapshotsCache[snapshotsCache.length - 1];
    const previous = snapshotsCache[snapshotsCache.length - 2];

    renderSnapshotCard(latest, "regression-snapshot-latest", "Latest Snapshot");
    renderSnapshotCard(previous, "regression-snapshot-previous", previous ? "Previous Snapshot" : "Baseline");

    if (snapshotsCache.length === 0) {
        setStatus("No snapshots captured yet. Take a baseline to unlock regression insights.");
    } else if (snapshotsCache.length === 1) {
        setStatus("Baseline captured. Capture another run to enable comparison.");
    } else {
        setStatus("Ready. Click “Compare to previous run” to see AI insights.");
    }
}

function renderSnapshotCard(snapshot, containerId, label) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!snapshot) {
        container.innerHTML = `<div class="output-empty">Waiting for data…</div>`;
        return;
    }

    const capturedAt = new Date(snapshot.capturedAt).toLocaleString();
    const domSize = (snapshot.domLength / 1000).toFixed(1);
    const metrics = [
        `${snapshot.networkCount || 0} API`,
        `${snapshot.consoleCount || 0} logs`,
        `${snapshot.accessibilityCount || 0} a11y`,
        `${snapshot.runtimeErrorCount || 0} runtime`,
    ].join(" · ");

    container.innerHTML = `
        <div class="snapshot-label">${label}</div>
        <div class="snapshot-meta">${capturedAt}</div>
        <div class="snapshot-metrics">${metrics}</div>
        ${
            snapshot.screenshot
                ? `<div class="snapshot-image"><img src="${snapshot.screenshot}" alt="Snapshot preview"></div>`
                : ""
        }
        <div class="snapshot-foot">DOM ~${domSize}k chars</div>
    `;
}

function renderReport({ diff, report }) {
    const container = document.getElementById("regression-report-output");
    if (!container) return;

    const accessibility = diff.accessibility || { newIssues: [], resolvedIssues: [] };
    const network = diff.network || { addedEndpoints: [], newFailures: [], slowerCalls: [] };

    const metricHtml = `
        <div class="regression-metrics">
            ${renderMetric(`${((diff.dom?.changeRatio || 0) * 100).toFixed(2)}%`, "DOM Delta")}
            ${renderMetric(diff.runtime?.latestCount ?? 0, "Runtime Errors")}
            ${renderMetric(diff.runtime?.clickErrorCount ?? 0, "Click Failures")}
            ${renderMetric(
                diff.screenshot?.diffRatio !== null && diff.screenshot?.diffRatio !== undefined
                    ? `${(diff.screenshot.diffRatio * 100).toFixed(2)}%`
                    : "n/a",
                "Pixel Diff"
            )}
            ${renderMetric(`${diff.stabilityScore}%`, "Stability Score")}
        </div>
    `;

    const chipHtml = `
        <div class="regression-diff-chips">
            ${renderChip("New Accessibility", accessibility.newIssues)}
            ${renderChip("Resolved Accessibility", accessibility.resolvedIssues)}
            ${renderChip("New Failures", network.newFailures)}
            ${renderChip("Slower Calls", network.slowerCalls?.map((item) => item.endpoint) || [])}
            ${renderChip("Runtime Errors", diff.runtime?.newErrors?.map((err) => err.message) || [])}
            ${renderChip("Missing Content", diff.semantics?.newMissing || [])}
            ${renderChip(
                "Off-screen Elements",
                diff.semantics?.offscreenElements?.map((item) => `${item.tag} @ ${Math.round(item.top)}px`) || []
            )}
        </div>
    `;

    container.innerHTML = `
        ${metricHtml}
        ${chipHtml}
        <div class="regression-report-text">
            ${formatMarkdown(report)}
        </div>
    `;

    setStatus(diff.shipDecision || "Regression analysis ready");
}

function renderMetric(value, label) {
    return `
        <div class="regression-metric">
            <div class="metric-value">${value}</div>
            <div class="metric-label">${label}</div>
        </div>
    `;
}

function renderChip(label, items = []) {
    if (!items || items.length === 0) {
        return `
            <div class="chip">
                <strong>${label}:</strong> None
            </div>
        `;
    }
    const summary = Array.isArray(items)
        ? items.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).slice(0, 3)
        : [];
    return `
        <div class="chip">
            <strong>${label}:</strong> ${summary.join(" · ")}${items.length > 3 ? " +" : ""}
        </div>
    `;
}

function formatMarkdown(text = "") {
    const escaped = text
        .replace(/^### (.*)$/gim, "<h4>$1</h4>")
        .replace(/^## (.*)$/gim, "<h3>$1</h3>")
        .replace(/^# (.*)$/gim, "<h2>$1</h2>")
        .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/gim, "<em>$1</em>")
        .replace(/^- (.*)$/gim, "<li>$1</li>");

    return escaped
        .split("\n\n")
        .map((block) => {
            if (block.startsWith("<h")) return block;
            if (block.startsWith("<li>")) return `<ul>${block}</ul>`;
            return `<p>${block}</p>`;
        })
        .join("");
}

function setStatus(message, isError = false) {
    const statusEl = document.getElementById("regression-status");
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle("text-error", Boolean(isError));
}
