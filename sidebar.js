// =============================
// QA Copilot — Sidebar UI Entry
// =============================

// --- Import all submodules (use relative paths)
import { setupBugReports } from "./ui/bug-reports.js";
import { setupNavigation } from "./ui/navigation.js";
import { setupRecording } from "./ui/recording-setup.js";
import { setupCollections } from "./ui/collections.js";
import { setupSettings, loadSettings } from "./ui/settings.js";
import { loadSavedTests } from "./ui/saved-tests.js";
import { setupAnalysis } from "./ui/analysis.js";
import { copyToClipboard, showToast } from "./core/utils.js";
import { setupTestData } from "./ui/test-data.js";
window.loadSavedTests = loadSavedTests;
import { setupAccessibilityAudit } from "./ui/accessibility.js";


console.log("✅ QA Copilot loaded");
// ===== AI SUMMARY GENERATOR (supports OpenAI + Gemini) =====

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
        setupBugReports();

        setupAccessibilityAudit();
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
// ===== TEST GENERATION =====
// =============================
function setupTestGeneration() {
    document.getElementById("generate-btn")?.addEventListener("click", handleGenerateTestCases);
    document.getElementById("extract-btn")?.addEventListener("click", handleExtractPage);
    document.getElementById("copy-tests-btn")?.addEventListener("click", () => {
        copyToClipboard("test-output");
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
// =============================
// ===== EXPORT TEST SUITE (Safe for MV3)
// =============================

// Helper: trigger file download from sidebar UI (DOM context)
function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Core export logic reused by both buttons
async function exportTestSuiteFromSidebar() {
    try {
        const { savedTests } = await chrome.storage.local.get("savedTests");
        const tests = savedTests || [];
        if (!tests.length) {
            showToast("No saved tests available for export", "warning");
            return;
        }

        const suiteName = `QA-Copilot-Test-Suite-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        const content = [
            `/**`,
            ` * Test Suite: ${suiteName}`,
            ` * Total Tests: ${tests.length}`,
            ` * Exported: ${new Date().toLocaleString()}`,
            ` */\n`,
            `describe('${suiteName}', () => {`,
            ...tests.map((t) => `
  it('${t.testName || "Unnamed Test"}', () => {
${(t.code || "").split("\n").map(l => "    " + l).join("\n")}
  });`
            ),
            `});`
        ].join("\n");

        downloadTextFile(content, `${suiteName}.spec.js`);
        showToast(`✅ Exported ${tests.length} tests as suite`, "success");
    } catch (error) {
        console.error("Export failed:", error);
        showToast("Export failed", "error");
    }
}

// Attach both buttons
document.getElementById("export-collection-btn")?.addEventListener("click", exportTestSuiteFromSidebar);
document.getElementById("download-btn")?.addEventListener("click", exportTestSuiteFromSidebar);




