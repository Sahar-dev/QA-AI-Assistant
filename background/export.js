// =============================
// QA Copilot — Export Utilities
// Handles exporting sessions, test suites, and bug reports
// =============================

import { log } from "./logger.js";

// ========== 1️⃣ Export Session Events (raw) ==========
export function exportSessionData(sender, sendResponse) {
    try {
        const tabId = sender?.tab?.id;
        if (!tabId) {
            sendResponse({ success: false, error: "No active tab found" });
            return;
        }

        chrome.storage.local.get(["savedTests"], (data) => {
            const savedTests = data.savedTests || [];
            sendResponse({ success: true, data: savedTests });
            log(`📤 Exported ${savedTests.length} saved tests`);
        });
    } catch (error) {
        log("❌ exportSessionData error:", error);
        sendResponse({ success: false, error: error.message });
    }
}

// ========== 2️⃣ Export Entire Test Suite as File ==========
export async function exportTestSuite() {
    try {
        const data = await chrome.storage.local.get(["savedTests"]);
        const tests = data.savedTests || [];

        if (!tests.length) {
            throw new Error("No saved tests available for export");
        }

        // Format all tests into one suite file
        const suiteName = `QA-Copilot-Test-Suite-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        const content = [
            `/**`,
            ` * Test Suite: ${suiteName}`,
            ` * Total Tests: ${tests.length}`,
            ` * Exported: ${new Date().toLocaleString()}`,
            ` */\n`,
            `describe('${suiteName}', () => {`,
            ...tests.map((t) => formatTestBlock(t)),
            `});`,
        ].join("\n\n");

        // Create and download file
        await downloadTextFile(content, `${suiteName}.spec.js`);
        log(`✅ Exported ${tests.length} tests as suite`);
        return { success: true, count: tests.length };
    } catch (error) {
        log("❌ exportTestSuite failed:", error);
        return { success: false, error: error.message };
    }
}

// Helper: format individual test blocks
function formatTestBlock(test) {
    return [
        `  it('${test.testName || "Unnamed Test"}', () => {`,
        test.code ? indentCode(test.code, 4) : "    // (empty test)",
        "  });",
    ].join("\n");
}

// ========== 3️⃣ Export Markdown Bug Report ==========
export async function exportBugReport(events = [], tab = {}) {
    try {
        const md = buildBugReport(events, tab);
        const filename = `bug-report-${Date.now()}.md`;
        await downloadTextFile(md, filename);
        log(`🐞 Bug report exported → ${filename}`);
        return { success: true };
    } catch (error) {
        log("❌ exportBugReport failed:", error);
        return { success: false, error: error.message };
    }
}

// Helper: generate markdown content
function buildBugReport(events = [], tab = {}) {
    const lastActions = events.slice(-10);
    return `### 🐛 Bug Report
**Page:** ${tab?.url || "Unknown"}
**Captured:** ${new Date().toLocaleString()}

#### 🔴 Recent Events
\`\`\`json
${JSON.stringify(lastActions, null, 2)}
\`\`\`

#### 💬 Notes
- Total events recorded: ${events.length}
- Page Title: ${tab?.title || "Untitled"}
`;
}

// ========== 4️⃣ Shared Helpers ==========
async function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function indentCode(code, spaces = 2) {
    const pad = " ".repeat(spaces);
    return code
        .split("\n")
        .map((line) => pad + line)
        .join("\n");
}
