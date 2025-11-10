
import { generateBugSummary } from "../core/ai.js";
import { sendToGitHub } from "../core/github.js";
import { sendToJira } from "../core/jira.js";
import { showToast } from "../core/utils.js";

// =============================
// ===== BUG REPORT TAB =====
// =============================
export async function setupBugReports() {
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



    async function saveLocally(bug) {
        const { bugReports } = await chrome.storage.local.get("bugReports");
        const reports = bugReports || [];
        reports.unshift(bug);
        await chrome.storage.local.set({ bugReports: reports });
        showToast("🐞 Bug saved locally", "info");
    }
}


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