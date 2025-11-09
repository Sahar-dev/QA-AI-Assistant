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
// ===== AI SUMMARY GENERATOR (supports OpenAI + Gemini) =====
// ===== AI SUMMARY GENERATOR (supports OpenAI + Gemini) =====
async function generateBugSummary(title, description, severity = "Unspecified") {
    try {
        const settings = await chrome.storage.sync.get(["apiKey", "aiProvider"]);
        let apiKey = settings.apiKey?.trim();
        if (!apiKey) {
            console.warn("No API key configured — skipping AI summary.");
            return null;
        }

        // Auto-detect provider by key type
        let provider = settings.aiProvider || "OpenAI GPT-4";
        if (apiKey.startsWith("AIza")) provider = "Gemini";
        if (apiKey.startsWith("sk-")) provider = "OpenAI GPT-4";

        console.log("🧠 Detected provider:", provider);

        // Stronger, safer prompt
        const prompt = `
You are an expert QA lead. Read the bug details below and summarize them **ONLY** as valid JSON.

Expected JSON structure:
{
  "title": "[Severity] <short summary> (<category>)",
  "impact": "<1–2 sentence concise explanation of what’s wrong, possible cause, or impact>"
}

Rules:
- Respond ONLY with JSON (no commentary, no code block markers, no text before or after).
- Categories may include: UI, Backend, Logic, Validation, Performance, API, Security.
- Keep title under 120 characters.
- If unsure about category, guess based on description.

Bug details:
Title: ${title}
Description: ${description}
Severity: ${severity}
`;

        // Choose provider
        if (provider.includes("OpenAI")) {
            return await callOpenAIBugSummary(apiKey, prompt);
        } else if (provider.includes("Gemini")) {
            return await callGeminiBugSummary(apiKey, prompt);
        } else {
            console.warn("Unsupported AI provider:", provider);
            return null;
        }
    } catch (err) {
        console.error("AI summary generation failed:", err);
        return null;
    }
}

// ---- OpenAI ----
async function callOpenAIBugSummary(apiKey, prompt) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a JSON-only QA summarizer. Never output anything except JSON." },
                { role: "user", content: prompt }
            ],
            max_tokens: 250,
            temperature: 0.3
        })
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log("🧠 Raw OpenAI summary result:", data);

    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    if (!raw) {
        console.warn("⚠️ OpenAI returned no content.");
        return { title: "", impact: "" };
    }

    return parseAISummary(raw);
}

// ---- Gemini ----
async function callGeminiBugSummary(apiKey, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 250 }
        })
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log("🧠 Raw Gemini summary result:", data);

    // ✅ Extract text robustly
    let raw =
        data.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n")?.trim() ||
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        "";

    // ✅ Clean up if Gemini wrapped it in code fences or prefix text
    raw = raw.replace(/```json|```/gi, "").trim();

    console.log("🧠 Gemini raw text extracted:", raw);
    return parseAISummary(raw);
}

// ---- Universal Parser ----
function parseAISummary(raw, fallbackTitle = "") {
    let cleaned = raw.trim();

    // Remove Markdown or text wrappers (common in Gemini)
    cleaned = cleaned.replace(/```(json)?/gi, "").trim();
    cleaned = cleaned.replace(/^.*?\{/, "{").replace(/\}[^}]*$/, "}").trim();

    let parsed = {};
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        console.warn("⚠️ AI JSON parse failed — fallback triggered. Raw:", cleaned);
        const titleMatch = cleaned.match(/"title"\s*:\s*"([^"]+)"/i);
        const impactMatch = cleaned.match(/"impact"\s*:\s*"([^"]+)"/i);
        parsed.title = titleMatch?.[1] || fallbackTitle;
        parsed.impact = impactMatch?.[1] || "";
    }

    if (parsed.title) parsed.title = parsed.title.replace(/^["']|["']$/g, "").trim();
    if (parsed.impact) parsed.impact = parsed.impact.replace(/^["']|["']$/g, "").trim();

    console.log("🧩 Parsed AI summary (final):", parsed);
    return parsed;
}
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
// ===== BUG REPORT TAB =====
// =============================
async function setupBugReports() {
    console.log("🐞 setupBugReports initialized");
    const list = document.getElementById("bug-list");
    const submitBtn = document.getElementById("create-bug-btn");

    // Load saved bugs on startup
    async function loadReports() {
        const { bugReports } = await chrome.storage.local.get("bugReports");
        const reports = bugReports || [];

        const summaryEl = document.getElementById("bug-summary");
        const list = document.getElementById("bug-list");
        const filterContainer = document.getElementById("project-filter"); // 👈 make sure exists in HTML

        if (!reports.length) {
            summaryEl.innerHTML = `<div style="text-align:center;color:#9ca3af;">No data to analyze.</div>`;
            list.innerHTML = `<div class="output-empty" style="text-align:center;color:#9ca3af;padding:10px;">No bug reports yet.</div>`;
            if (filterContainer) filterContainer.innerHTML = "";
            return;
        }
        // 🧩 BUILD PROJECT FILTER (✅ put it here)
        const projects = [...new Set(reports.map(r => r.project).filter(Boolean))];
        if (filterContainer) {
            filterContainer.innerHTML = `
      <select id="projectSelect" style="padding:4px 8px;border-radius:6px;margin-bottom:8px;">
        <option value="">All Projects</option>
        ${projects.map(p => `<option value="${p}">${p}</option>`).join("")}
      </select>
    `;

            document.getElementById("projectSelect").addEventListener("change", e => {
                const selected = e.target.value;
                const filtered = selected ? reports.filter(r => r.project === selected) : reports;
                renderFiltered(filtered);
            });


            function renderFiltered(filteredReports) {
                const summaryEl = document.getElementById("bug-summary");
                const list = document.getElementById("bug-list");

                // --- Analytics ---
                const total = filteredReports.length;
                const bySeverity = filteredReports.reduce((acc, r) => {
                    const key = (r.severity || "Unspecified").toLowerCase();
                    acc[key] = (acc[key] || 0) + 1;
                    return acc;
                }, {});

                const aiSummaries = filteredReports.filter(r => r.generateSummary).length;
                const withScreenshots = filteredReports.filter(r => r.includeScreenshot).length;

                summaryEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:space-around;">
      <div><strong>Total Reports:</strong> ${total}</div>
      <div><strong>AI Summaries:</strong> ${aiSummaries}</div>
      <div><strong>Screenshots:</strong> ${withScreenshots}</div>
    </div>
    <div style="margin-top:8px;">
      ${Object.entries(bySeverity)
                        .map(([sev, count]) => `
          <span class="badge badge-${sev}" style="margin-right:6px;">
            ${sev.charAt(0).toUpperCase() + sev.slice(1)}: ${count}
          </span>
        `)
                        .join("")}
    </div>
  `;

                // --- List ---
                const recent = [...filteredReports].reverse().slice(0, 5);
                list.innerHTML = recent.map(r => `
    <div class="bug-card" style="margin-bottom:8px;padding:10px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;">
      <div style="display:flex;justify-content:space-between;">
        <strong>${r.title}</strong>
        <span class="badge badge-${r.severity.toLowerCase()}">${r.severity}</span>
      </div>
      <div style="font-size:12px;color:#555;margin-top:4px;">
        <em>${r.project || "General"}</em> — ${r.feature || "N/A"}
      </div>
      <div style="font-size:11px;color:#999;margin-top:6px;">
        ${new Date(r.createdAt).toLocaleString()}
      </div>
    </div>
  `).join("");
            }

        }


        // ====== Quick analytics ======
        const total = reports.length;
        const bySeverity = reports.reduce((acc, r) => {
            const key = (r.severity || "Unspecified").toLowerCase();
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const aiSummaries = reports.filter(r => r.generateSummary).length;
        const withScreenshots = reports.filter(r => r.includeScreenshot).length;

        // ====== Build summary section ======
        summaryEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:space-around;">
      <div><strong>Total Reports:</strong> ${total}</div>
      <div><strong>AI Summaries:</strong> ${aiSummaries}</div>
      <div><strong>Screenshots:</strong> ${withScreenshots}</div>
    </div>
    <div style="margin-top:8px;">
      ${Object.entries(bySeverity)
                .map(([sev, count]) => `
          <span class="badge badge-${sev}" style="margin-right:6px;">
            ${sev.charAt(0).toUpperCase() + sev.slice(1)}: ${count}
          </span>
        `)
                .join("")}
    </div>
  `;

        // ====== Render recent list ======
        const recent = [...reports].reverse().slice(0, 5);
        list.innerHTML = recent.map(r => `
    <div class="bug-card" style="margin-bottom:8px;padding:10px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;">
      <div style="display:flex;justify-content:space-between;">
        <strong>${r.title}</strong>
        <span class="badge badge-${r.severity.toLowerCase()}">${r.severity}</span>
      </div>
      <div style="font-size:12px;color:#555;margin-top:4px;">${r.aiImpact || r.description.slice(0, 100)}...</div>
      <div style="font-size:11px;color:#999;margin-top:6px;">
        ${new Date(r.createdAt).toLocaleString()}
      </div>
    </div>
  `).join("");
    }


    loadReports();

    // Handle submit
    submitBtn?.addEventListener("click", async () => {

        const title = document.getElementById("bug-title")?.value.trim();
        const desc = document.getElementById("bug-desc")?.value.trim();
        const severity = document.getElementById("bug-severity")?.value;
        const generateSummary = document.getElementById("ai-summary-toggle")?.checked || false;
        const includeScreenshot = document.getElementById("include-screenshot-toggle")?.checked || false;
        // 🧩 NEW: capture project and feature safely
        const project = document.getElementById("bug-project")?.value.trim() || "";
        const feature = document.getElementById("bug-feature")?.value.trim() || "";
        if (!title || !desc) {
            showToast("Please fill in title and description", "error");
            return;
        }

        const bug = {
            title,
            description: desc,
            severity,
            project,
            feature,
            createdAt: new Date().toISOString(),
            generateSummary,
            includeScreenshot
        };
        await handleBugSubmit(bug);
        await loadReports();

        document.getElementById("bug-title").value = "";
        document.getElementById("bug-desc").value = "";
    });

    async function uploadImageToGitHub(base64Data, p) {
        try {
            // GitHub expects base64 without prefix
            const pureBase64 = base64Data.replace(/^data:image\/png;base64,/, "");

            // You can use a temporary file name
            const fileName = `bug-screenshot-${Date.now()}.png`;

            // Create image in the repo under a hidden folder
            const res = await fetch(
                `https://api.github.com/repos/${p.githubUsername}/${p.githubRepo}/contents/.qa-screenshots/${fileName}`,
                {
                    method: "PUT",
                    headers: {
                        "Authorization": `token ${p.githubToken}`,
                        "Accept": "application/vnd.github.v3+json",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        message: `Add screenshot for bug report (${fileName})`,
                        content: pureBase64
                    })
                }
            );

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);

            return data.content?.download_url; // direct public link
        } catch (err) {
            console.warn("❌ Screenshot upload failed:", err);
            return null;
        }
    }

    // =============================
    // ===== HANDLERS (internal)
    // =============================
    async function handleBugSubmit(bug) {
        const prefs = await chrome.storage.sync.get([
            "githubEnabled", "jiraEnabled",
            "githubUsername", "githubRepo", "githubToken",
            "jiraDomain", "jiraEmail", "jiraToken", "jiraProject"
        ]);

        if (prefs.githubEnabled && prefs.githubToken && prefs.githubRepo) {
            if (bug.generateSummary) {
                const aiSummary = await generateBugSummary(bug.title, bug.description, bug.severity);
                console.log("🧠 AI summary returned:", aiSummary);

                // ✅ show preview modal here
                showBugPreview(bug, aiSummary, async (finalBug) => {
                    await sendToGitHub(finalBug, prefs);
                });
            } else {
                await sendToGitHub(bug, prefs);
            }
        }
        else if (prefs.jiraEnabled && prefs.jiraToken && prefs.jiraDomain) {
            await sendToJira(bug, prefs);
        }
        await saveLocally(bug);

    }
    async function captureScreenshot() {
        return new Promise((resolve) => {
            chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    console.warn("Screenshot failed:", chrome.runtime.lastError);
                    resolve(null);
                } else resolve(dataUrl);
            });
        });
    }
    async function sendToGitHub(bug, p) {
        console.log("🐙 Preparing GitHub issue with enhancements...");

        // Step 1: Capture screenshot if user selected
        const screenshot = bug.includeScreenshot ? await captureScreenshot() : null;

        // Step 2: AI summary (optional)
        let aiSummary = null;
        if (bug.generateSummary) {
            aiSummary = await generateBugSummary(bug.title, bug.description);
        }

        // Use AI-generated title if available
        const issueTitle = aiSummary?.title || bug.title;

        // Step 3: Environment details
        const browserInfo = `${navigator.userAgent}`;
        const extVersion = chrome.runtime.getManifest().version;
        const pageUrl = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url || "Unknown";

        // Step 4: Upload screenshot if needed
        let screenshotUrl = null;
        if (screenshot) {
            screenshotUrl = await uploadImageToGitHub(screenshot, p);
        }

        // Step 5: Build Markdown body
        let body = "";

        if (aiSummary?.impact) {
            body += `**🧠 AI Impact Summary:** ${aiSummary.impact}\n\n`;
        }

        body += `### 🧾 Description
${bug.description}

### 🌐 Environment
- **URL:** ${pageUrl}
- **Browser:** ${browserInfo}
- **Extension Version:** ${extVersion}

### ⚙️ Severity
${bug.severity}
`;

        if (screenshotUrl) {
            body += `\n### 📸 Screenshot\n![Bug Screenshot](${screenshotUrl})`;
        } else if (screenshot) {
            // fallback if upload fails
            body += `\n### 📸 Screenshot (inline backup)\n![Bug Screenshot](${screenshot})`;
        }

        // Step 6: Send to GitHub
        try {
            const res = await fetch(`https://api.github.com/repos/${p.githubUsername}/${p.githubRepo}/issues`, {
                method: "POST",
                headers: {
                    "Authorization": `token ${p.githubToken}`,
                    "Accept": "application/vnd.github+json"
                },
                body: JSON.stringify({
                    title: issueTitle,
                    body,
                    labels: ["QA-Copilot", bug.severity]
                })
            });

            const text = await res.text();
            console.log("📡 GitHub response:", res.status, text);

            if (!res.ok) throw new Error(`GitHub ${res.status}: ${text}`);

            showToast("✅ Bug reported to GitHub", "success");
        } catch (err) {
            console.error("🔥 GitHub issue creation failed:", err);
            showToast(`GitHub error: ${err.message}`, "error");
        }
    }

    async function sendToJira(bug, p) {
        try {
            const res = await fetch(`https://${p.jiraDomain}/rest/api/3/issue`, {
                method: "POST",
                headers: {
                    Authorization: "Basic " + btoa(`${p.jiraEmail}:${p.jiraToken}`),
                    Accept: "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    fields: {
                        project: { key: p.jiraProject },
                        summary: bug.title,
                        description: bug.description,
                        issuetype: { name: "Bug" },
                        priority: { name: bug.severity }
                    }
                })
            });
            if (!res.ok) throw new Error(res.statusText);
            showToast("✅ Sent to Jira", "success");
        } catch (err) {
            console.error(err);
            showToast("Jira issue creation failed", "error");
        }
    }

    async function saveLocally(bug) {
        const { bugReports } = await chrome.storage.local.get("bugReports");
        const reports = bugReports || [];
        reports.unshift(bug);
        await chrome.storage.local.set({ bugReports: reports });
        showToast("🐞 Bug saved locally", "info");
    }
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


function showBugPreview(bug, aiSummary, onConfirm) {
    const modal = document.createElement("div");
    modal.className = "qa-modal";

    modal.innerHTML = `
    <div class="qa-modal-content">
      <h3>🧠 Review AI Bug Summary</h3>
      <label>Title</label>
      <input id="qa-preview-title" value="${aiSummary?.title || bug.title}">
      <label>Impact</label>
      <textarea id="qa-preview-impact">${aiSummary?.impact || ""}</textarea>
      <label>Description</label>
      <textarea id="qa-preview-desc">${bug.description}</textarea>
      <div class="qa-actions">
        <button id="qa-confirm">🚀 Confirm & Send</button>
        <button id="qa-cancel">❌ Cancel</button>
      </div>
    </div>
  `;

    document.body.appendChild(modal);

    modal.querySelector("#qa-cancel").addEventListener("click", () => modal.remove());
    modal.querySelector("#qa-confirm").addEventListener("click", () => {
        const updated = {
            ...bug,
            title: modal.querySelector("#qa-preview-title").value.trim(),
            description: modal.querySelector("#qa-preview-desc").value.trim(),
            aiImpact: modal.querySelector("#qa-preview-impact").value.trim(),
        };
        modal.remove();
        onConfirm(updated);
    });
}
