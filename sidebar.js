// =============================
// QA Copilot — Sidebar UI Entry
// =============================

// --- Import all submodules (use relative paths)

import { setupNavigation } from "./ui/navigation.js";
import { setupRecording } from "./ui/recording-setup.js";
import { setupCollections } from "./ui/collections.js";
import { setupSettings, loadSettings } from "./ui/settings.js";
import { loadSavedTests } from "./ui/saved-tests.js";
import { setupAnalysis } from "./ui/analysis.js";
import { setupAccessibility } from "./ui/accessibility.js";
window.loadSavedTests = loadSavedTests;
import { showToast, copyToClipboard, downloadFile } from "./core/utils.js";

console.log("✅ QA Copilot loaded");

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", async () => {
    console.log("⚙️ Initializing QA Copilot UI...");
    await initApp();
});

async function initApp() {
    try {
        setupNavigation();
        setupTestGeneration();
        setupAnalysis();
        setupTestData();
        setupTimeline();
        setupAccessibility();
        setupRecording();
        setupCollections();
        setupSettings();
        loadSavedTests();
        await loadSettings();

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.savedTests) loadSavedTests();
        });
    } catch (error) {
        console.error("Initialization failed:", error);
        showToast("UI initialization failed", "error");
    }
}

// =============================
// ===== TIMELINE TAB =====
// =============================
function setupTimeline() {
    const container = document.getElementById("timeline-container");

    async function getTimelineModule() {
        if (!window._timelineModule) {
            const url = chrome.runtime.getURL("timeline-view.js");
            window._timelineModule = await import(url);
        }
        return window._timelineModule;
    }

    document.getElementById("refresh-timeline")?.addEventListener("click", async () => {
        try {
            const mod = await getTimelineModule();
            mod.renderTimeline(container);
        } catch (error) {
            console.error("Timeline refresh failed:", error);
        }
    });

    setInterval(async () => {
        const tabPane = document.getElementById("timeline");
        if (tabPane?.classList.contains("active")) {
            try {
                const mod = await getTimelineModule();
                mod.renderTimeline(container);
            } catch (error) {
                console.error("Timeline auto-refresh failed:", error);
            }
        }
    }, 10000);

    document.getElementById("report-bug-btn")?.addEventListener("click", async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const res = await chrome.runtime.sendMessage({ action: "exportSession", tabId: tab.id });
            const events = res?.data || [];

            const bugData = {
                page: tab.url,
                capturedAt: new Date().toISOString(),
                recentErrors: events.filter(e => e.type.includes("error")),
                recentNetwork: events.filter(e => ["fetch", "xhr", "fetch_error"].includes(e.type)),
                lastActions: events.slice(-10)
            };

            const md = `### 🐛 Bug Report
**Page:** ${bugData.page}
**Captured:** ${bugData.capturedAt}

#### 🔴 Recent Errors
\`\`\`json
${JSON.stringify(bugData.recentErrors, null, 2)}
\`\`\`

#### 🌐 Network Requests
\`\`\`json
${JSON.stringify(bugData.recentNetwork, null, 2)}
\`\`\`

#### 🪄 Last User Actions
\`\`\`json
${JSON.stringify(bugData.lastActions, null, 2)}
\`\`\``;

            downloadFile(md, `bug-report-${Date.now()}.md`, "text/markdown");
            showToast("Bug report exported", "success");
        } catch (error) {
            console.error("Bug report failed:", error);
            showToast("Failed to export bug report", "error");
        }
    });
}

// =============================
// ===== TEST GENERATION =====
// =============================
function setupTestGeneration() {
    document.getElementById("generate-btn")?.addEventListener("click", handleGenerateTestCases);
    document.getElementById("extract-btn")?.addEventListener("click", handleExtractPage);
    document.getElementById("copy-tests-btn")?.addEventListener("click", () => {
        copyToClipboard(document.getElementById("test-output")?.textContent || "");
    });
}

// --- Handle AI-generated test cases
async function handleGenerateTestCases() {
    const featureText = document.getElementById("feature-input")?.value.trim();
    const testType = document.getElementById("test-type")?.value;
    const riskLevel = document.getElementById("risk-level")?.value;
    const output = document.getElementById("test-output");

    if (!featureText) {
        showToast("Please describe the feature first", "error");
        return;
    }

    output.innerHTML = `<div class="loading"><div class="spinner"></div> Generating tests...</div>`;

    try {
        const response = await chrome.runtime.sendMessage({
            action: "generateTestCases",
            data: { featureText, testType, riskLevel }
        });

        if (response && response.success) {
            output.textContent = response.testCases || "// (empty)";
            showToast("Tests generated!", "success");
        } else {
            output.textContent = "// No response from background.";
            console.warn("No response from background (generateTestCases).");
            showToast("No response from background", "warning");
        }
    } catch (error) {
        output.textContent = "Error: " + error.message;
        console.error("Test generation failed:", error);
        showToast("Generation failed", "error");
    }
}

// --- Extract Page Structure
async function handleExtractPage() {
    const output = document.getElementById("feature-input");

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await chrome.runtime.sendMessage({
            action: "extractPageContent",
            tabId: tab.id
        });

        if (response && response.success) {
            const data = response.data?.data || {};
            const extracted = `Page: ${data.title || "Unknown"}
URL: ${data.url || ""}

Form Fields: ${data.inputs?.map(i => i.name).join(", ") || "None"}
Buttons: ${data.buttons?.join(", ") || "None"}`;

            output.value = extracted;
            showToast("Page content extracted!", "success");
        } else {
            showToast("No response from background", "warning");
        }
    } catch (error) {
        console.error("Extract page failed:", error);
        showToast("Failed to extract page", "error");
    }
}

// =============================
// ===== TEST DATA =====
// =============================
function setupTestData() {
    // placeholder for any future logic
}

// =============================
// ===== GLOBAL STYLE FIXES =====
// =============================
const style = document.createElement("style");
style.textContent = `
  @keyframes fadeOut {
    to { opacity: 0; transform: translateX(400px); }
  }
  .hidden { display: none !important; }
`;
document.head.appendChild(style);
