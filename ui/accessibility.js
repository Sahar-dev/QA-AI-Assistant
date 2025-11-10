import { showToast } from "../core/utils.js";
import { getSync, setSync } from "../core/storage.js";
import { generateBugSummary } from "../core/ai.js";
import { captureScreenshot } from "../core/utils.js";
import { uploadImageToGitHub, sendToGitHub_AuditReport, sendToGitHub_A11Y } from "../core/github.js";
import { sendToJira_AuditReport, sendToJira_A11Y } from "../core/jira.js";


// ===== ACCESSIBILITY AUDIT UI =====
let lastAudit = null;

export async function setupAccessibilityAudit() {
    const runBtn = document.getElementById("run-a11y-btn");
    const genTestsBtn = document.getElementById("a11y-gen-tests");
    const reportBtn = document.getElementById("report-a11y-bugs");
    const list = document.getElementById("a11y-list");
    const summary = document.getElementById("a11y-summary");
    if (!list || !summary) {
        console.warn("Accessibility elements not found — maybe tab not visible yet?");
        return;
    }

    summary.innerHTML = "";
    if (!runBtn) return;

    runBtn.addEventListener("click", async () => {
        list.innerHTML = `<div style="padding:8px;color:#777;">Running audit...</div>`;
        summary.innerHTML = "";
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const response = await chrome.runtime.sendMessage({
                action: "analyzeAccessibility",
                tabId: tab.id
            });

            if (response?.success && response.results) {
                lastAudit = response.results;
                renderAccessibilityResults(lastAudit);
                showToast("Accessibility audit complete", "success");
            } else {
                list.innerHTML = `<div style="color:#999;">No results returned.</div>`;
            }
        } catch (err) {
            console.error("Audit failed:", err);
            list.innerHTML = `<div style="color:red;">Error: ${err.message}</div>`;
            showToast("Accessibility audit failed", "error");
        }
    });

    genTestsBtn?.addEventListener("click", async () => {
        if (!lastAudit) {
            showToast("Run an audit first", "warning");
            return;
        }
        const summaryText = `Accessibility issues found: ${lastAudit.violations.length}`;
        await chrome.runtime.sendMessage({
            action: "generateTestCases",
            data: { featureText: summaryText }
        });
        showToast("AI test cases generated from accessibility results", "success");
    });

    reportBtn?.addEventListener("click", async () => {
        if (!lastAudit || !lastAudit.violations?.length) {
            showToast("Run an audit first", "warning");
            return;
        }
        showToast("📦 Preparing full accessibility report...", "info");
        await createAccessibilityAuditReport(lastAudit);
    });

}
// ======= COMBINED ACCESSIBILITY AUDIT REPORT =======
async function createAccessibilityAuditReport(results) {
    const settings = await chrome.storage.sync.get([
        "aiProvider", "apiKey",
        "githubEnabled", "githubUsername", "githubRepo", "githubToken",
        "jiraEnabled", "jiraDomain", "jiraEmail", "jiraToken", "jiraProject"
    ]);

    const aiKey = settings.apiKey?.trim();
    const aiProvider = settings.aiProvider || "OpenAI GPT-4";
    const useAI = !!aiKey;

    const violations = results.violations || [];
    const score = (() => {
        const weights = { minor: 1, moderate: 2, serious: 3, critical: 4 };
        const max = violations.length * 4 || 1;
        const total = violations.reduce((sum, v) => sum + (weights[v.impact] || 2), 0);
        return Math.round(Math.max(0, 100 - (total / max) * 100));
    })();

    // Group by severity
    const grouped = violations.reduce((acc, v) => {
        acc[v.impact] = acc[v.impact] || [];
        acc[v.impact].push(v);
        return acc;
    }, {});

    const impactStats = Object.entries(grouped)
        .map(([impact, arr]) => `- **${impact}**: ${arr.length}`)
        .join("\n");

    // Create detailed findings section
    const findings = Object.entries(grouped).map(([impact, arr]) => {
        return `### ${impact.toUpperCase()} Issues (${arr.length})
${arr.map(v => `
- **${v.help}**
  - Rule: ${v.id}
  - Description: ${v.description}
  - Elements: ${v.nodes.map(n => n.target.join(", ")).join("; ")}
  - [WCAG Reference](${v.helpUrl})
`).join("\n")}`;
    }).join("\n\n");

    // ===== Build base markdown =====
    let markdown = `
# 🧩 Accessibility Audit Report
**Date:** ${new Date().toLocaleString()}
**Score:** ${score}/100
**Total Issues:** ${violations.length}

## 📊 Impact Breakdown
${impactStats}

---

${findings}
`;

    // ===== AI Enrichment =====
    if (useAI) {
        try {
            const prompt = `
You are an accessibility QA lead. Summarize this audit report professionally for a GitHub issue.
Mention the overall risk, general observations, and key recommendations. Keep it under 150 words.

Accessibility Score: ${score}/100
Total Issues: ${violations.length}
Impact Summary:
${impactStats}
`;

            let aiResponse = "";
            if (aiProvider.includes("OpenAI")) {
                const res = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${aiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "You are an accessibility QA lead summarizing audits." },
                            { role: "user", content: prompt }
                        ],
                        max_tokens: 250,
                        temperature: 0.4
                    })
                });
                const data = await res.json();
                aiResponse = data.choices?.[0]?.message?.content?.trim() || "";
            }
            if (aiResponse) {
                markdown = `### 🧠 AI Summary\n${aiResponse}\n\n---\n${markdown}`;
            }
        } catch (err) {
            console.warn("AI summary failed:", err);
        }
    }

    // ===== Screenshot Capture =====
    let screenshotUrl = null;
    try {
        const screenshot = await captureScreenshot();
        if (screenshot && settings.githubEnabled) {
            screenshotUrl = await uploadImageToGitHub(screenshot, {
                githubUsername: settings.githubUsername,
                githubRepo: settings.githubRepo,
                githubToken: settings.githubToken
            });
            if (screenshotUrl) {
                markdown += `\n\n### 📸 Screenshot\n![Accessibility Screenshot](${screenshotUrl})`;
            }
        }
    } catch (err) {
        console.warn("Screenshot failed:", err);
    }

    const title = `[A11y Audit] WCAG Compliance Report (${score}/100)`;

    // ===== Push to GitHub or Jira =====
    if (settings.githubEnabled && settings.githubToken && settings.githubRepo) {
        await sendToGitHub_AuditReport(title, markdown, settings);
    } else if (settings.jiraEnabled && settings.jiraToken && settings.jiraDomain) {
        await sendToJira_AuditReport(title, markdown, settings);
    } else {
        const { bugReports } = await chrome.storage.local.get("bugReports");
        const reports = bugReports || [];
        reports.unshift({ title, description: markdown, createdAt: new Date().toISOString(), project: "Accessibility Audit" });
        await chrome.storage.local.set({ bugReports: reports });
        showToast("🐞 Accessibility report saved locally", "info");
    }
}

// Helper: Renders results
async function renderAccessibilityResults(results) {
    const list = document.getElementById("a11y-list");
    const summary = document.getElementById("a11y-summary");
    const violations = results.violations || [];

    if (!violations.length) {
        summary.innerHTML = `<div style="color:#22c55e;text-align:center;margin:12px 0;">✅ No accessibility issues found! Excellent job.</div>`;
        list.innerHTML = "";
        return;
    }

    // ===== SCORE =====
    const weights = { minor: 1, moderate: 2, serious: 3, critical: 4 };
    const max = violations.length * 4 || 1;
    const total = violations.reduce((sum, v) => sum + (weights[v.impact] || 2), 0);
    const score = Math.round(Math.max(0, 100 - (total / max) * 100));
    const scoreColor = score > 80 ? "#16a34a" : score > 50 ? "#facc15" : "#dc2626";

    summary.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div><strong>Total Issues:</strong> ${violations.length}</div>
        <div><strong>Score:</strong> <span style="color:${scoreColor};font-weight:600;">${score}/100</span></div>
      </div>
      <div style="height:6px;width:100%;background:#eee;border-radius:4px;overflow:hidden;margin-bottom:8px;">
        <div style="width:${score}%;background:${scoreColor};height:6px;border-radius:4px;"></div>
      </div>
      <div style="font-size:12px;color:#666;">Standard: <strong>WCAG 2.1</strong></div>
    `;

    // ===== GROUP BY IMPACT =====
    const grouped = violations.reduce((acc, v) => {
        acc[v.impact] = acc[v.impact] || [];
        acc[v.impact].push(v);
        return acc;
    }, {});

    const impactOrder = ["critical", "serious", "moderate", "minor"];
    list.innerHTML = impactOrder
        .filter(level => grouped[level])
        .map(level => {
            const color =
                level === "critical" ? "#ef4444" :
                    level === "serious" ? "#f97316" :
                        level === "moderate" ? "#facc15" :
                            "#22c55e";

            const items = grouped[level].map((v, idx) => {
                const fixHint = getLocalFixHint(v.id, v.help);
                const cardId = `a11y-${level}-${idx}`;
                return `
                <div class="issue-card" id="${cardId}" style="border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px;background:#fafafa;">
                    <div class="issue-title" style="font-weight:600;color:${color};">
                        ${v.help}
                    </div>
                    <div class="issue-desc" style="font-size:12px;color:#555;margin:4px 0;">${v.description}</div>
                    <div class="issue-target" style="font-size:11px;color:#999;">${v.nodes.map(n => n.target.join(', ')).join('<br>')}</div>

                    ${fixHint ? `<div class="fix-hint" style="font-size:11px;color:#2563eb;margin-top:4px;">💡 <strong>Hint:</strong> ${fixHint}</div>` : ""}

                    <div style="margin-top:6px;display:flex;gap:6px;">
                        <button class="btn btn-ghost btn-sm" data-explain="${cardId}" data-help="${v.help}" data-rule="${v.id}">
                            🧠 Explain
                        </button>
                        <a href="${v.helpUrl}" target="_blank" class="btn btn-ghost btn-sm">📘 WCAG</a>
                    </div>
                    <div class="explain-output" style="font-size:11px;color:#444;margin-top:6px;display:none;"></div>
                </div>`;
            }).join("");

            return `
              <h4 style="margin-top:12px;color:${color};text-transform:capitalize;">
                ${level} Issues (${grouped[level].length})
              </h4>
              ${items}`;
        })
        .join("");

    // ===== Bind Explain Buttons =====
    document.querySelectorAll("[data-explain]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const cardId = btn.dataset.explain;
            const output = document.querySelector(`#${cardId} .explain-output`);
            if (!output) return;
            output.style.display = "block";
            output.innerHTML = `<span style="color:#999;">Analyzing with AI...</span>`;

            const help = btn.dataset.help;
            const rule = btn.dataset.rule;
            try {
                const aiResponse = await explainA11yIssue(help, rule);
                output.innerHTML = `<div style="color:#111;"><strong>AI Advisor:</strong> ${aiResponse}</div>`;
            } catch (err) {
                console.error(err);
                output.innerHTML = `<div style="color:red;">AI explanation failed: ${err.message}</div>`;
            }
        });
    });
}
// Local quick hints for common WCAG issues
function getLocalFixHint(ruleId, help) {
    const hints = {
        "image-alt": "Add meaningful alt text to describe the image’s purpose.",
        "label": "Ensure each input element has a visible or aria-label.",
        "color-contrast": "Use higher contrast between text and background.",
        "button-name": "Add text or aria-label to buttons without visible labels.",
        "aria-roles": "Ensure ARIA roles are valid and supported.",
        "tabindex": "Avoid large positive tabindex values; maintain logical order."
    };
    const key = Object.keys(hints).find(k => ruleId.includes(k));
    return key ? hints[key] : (help.toLowerCase().includes("alt") ? hints["image-alt"] : null);
}

// Call OpenAI / Gemini depending on settings
async function explainA11yIssue(help, ruleId) {
    const settings = await chrome.storage.sync.get(["apiKey", "aiProvider"]);
    const apiKey = settings.apiKey?.trim();
    const provider = settings.aiProvider || "OpenAI GPT-4";
    const prompt = `
You are an accessibility QA expert. Explain this accessibility violation and suggest a fix in 2–3 sentences.

Rule ID: ${ruleId}
Issue: ${help}

Respond clearly for a QA engineer (no jargon).
`;

    if (!apiKey) {
        throw new Error("Missing API key — configure one in Settings.");
    }

    // OpenAI (default)
    if (provider.includes("OpenAI")) {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "You are an accessibility QA assistant." },
                    { role: "user", content: prompt }
                ],
                max_tokens: 150,
                temperature: 0.4
            })
        });
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || "No explanation returned.";
    }

    // Gemini fallback
    if (provider.includes("Gemini")) {
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 150 }
            })
        });
        const data = await res.json();
        return (
            data.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n")?.trim() ||
            "No response from AI."
        );
    }

    throw new Error("Unsupported AI provider.");
}



// ======= SMART ACCESSIBILITY BUG REPORTER (GitHub + Jira Integrated) =======
async function createBugFromAccessibility(issue) {
    const settings = await chrome.storage.sync.get([
        "aiProvider", "apiKey",
        "githubEnabled", "jiraEnabled",
        "githubUsername", "githubRepo", "githubToken",
        "jiraDomain", "jiraEmail", "jiraToken", "jiraProject"
    ]);

    const aiKey = settings.apiKey?.trim();
    const aiProvider = settings.aiProvider || "OpenAI GPT-4";
    const useAI = !!aiKey;

    const impactLevel = issue.impact === "critical" ? "Critical" :
        issue.impact === "serious" ? "High" :
            issue.impact === "moderate" ? "Medium" : "Low";

    // ====== Build base bug ======
    const bug = {
        title: `[A11y][${impactLevel}] ${issue.help} (${issue.id})`,
        severity: impactLevel,
        project: "Accessibility Audit",
        feature: issue.id,
        createdAt: new Date().toISOString(),
        includeScreenshot: true,
        generateSummary: useAI
    };

    // Collect affected selectors
    const selectors = issue.nodes.map(n => n.target.join(", ")).join("\n");

    // ====== Build base markdown description ======
    let desc = `### 🧩 Accessibility Violation
**Rule:** ${issue.id}  
**Description:** ${issue.description}  
**Impact Level:** ${impactLevel}  

**Affected Elements:**  
${selectors}

**WCAG Reference:** ${issue.helpUrl}
`;

    // ====== AI Enrichment ======
    if (useAI) {
        try {
            const prompt = `
You are an accessibility QA engineer. Write a professional bug report for the following violation.
Include a short title, impact summary, and recommended fix. Use markdown formatting.

Rule: ${issue.id}
Impact: ${impactLevel}
Help: ${issue.help}
Description: ${issue.description}
Affected Elements: ${selectors}
WCAG URL: ${issue.helpUrl}
`;

            let aiResponse = "";
            if (aiProvider.includes("OpenAI")) {
                const res = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${aiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "You are a QA automation and accessibility expert. Output only a well-structured markdown report." },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.3,
                        max_tokens: 350
                    })
                });
                const data = await res.json();
                aiResponse = data.choices?.[0]?.message?.content?.trim() || "";
            }

            if (aiResponse) {
                desc += `\n---\n\n${aiResponse}`;
            }
        } catch (err) {
            console.warn("AI enrichment failed:", err);
        }
    }

    bug.description = desc;

    // ====== Decide destination ======
    if (settings.githubEnabled && settings.githubToken && settings.githubRepo) {
        await sendToGitHub_A11Y(bug, settings);
    } else if (settings.jiraEnabled && settings.jiraToken && settings.jiraDomain) {
        await sendToJira_A11Y(bug, settings);
    } else {
        const { bugReports } = await chrome.storage.local.get("bugReports");
        const reports = bugReports || [];
        reports.unshift(bug);
        await chrome.storage.local.set({ bugReports: reports });
        showToast("🐞 Saved locally (no GitHub/Jira integration)", "info");
    }
}