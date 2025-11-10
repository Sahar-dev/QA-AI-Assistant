import { captureScreenshot } from "../core/utils.js";
import { showToast } from "../core/utils.js";
import { generateBugSummary } from "../core/ai.js";

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
}// ===== GITHUB REPORTER FOR A11Y =====
async function sendToGitHub_A11Y(bug, s) {
    try {
        const screenshot = await captureScreenshot();
        const screenshotUrl = screenshot ? await uploadImageToGitHub(screenshot, {
            githubUsername: s.githubUsername,
            githubRepo: s.githubRepo,
            githubToken: s.githubToken
        }) : null;

        let body = bug.description;
        if (screenshotUrl) {
            body += `\n\n### 📸 Screenshot\n![Accessibility Screenshot](${screenshotUrl})`;
        }

        const res = await fetch(`https://api.github.com/repos/${s.githubUsername}/${s.githubRepo}/issues`, {
            method: "POST",
            headers: {
                "Authorization": `token ${s.githubToken}`,
                "Accept": "application/vnd.github+json"
            },
            body: JSON.stringify({
                title: bug.title,
                body,
                labels: ["QA-Copilot", "Accessibility", bug.severity]
            })
        });

        const text = await res.text();
        console.log("🐙 GitHub A11Y Response:", res.status, text);

        if (!res.ok) throw new Error(text);
        showToast(`✅ Accessibility issue reported to GitHub (${bug.severity})`, "success");
    } catch (err) {
        console.error("GitHub A11Y issue creation failed:", err);
        showToast(`GitHub error: ${err.message}`, "error");
    }
}

async function sendToGitHub_AuditReport(title, body, s) {
    try {
        const res = await fetch(`https://api.github.com/repos/${s.githubUsername}/${s.githubRepo}/issues`, {
            method: "POST",
            headers: {
                "Authorization": `token ${s.githubToken}`,
                "Accept": "application/vnd.github+json"
            },
            body: JSON.stringify({
                title,
                body,
                labels: ["QA-Copilot", "Accessibility Audit", "WCAG"]
            })
        });
        const text = await res.text();
        console.log("🐙 GitHub Audit Report:", res.status, text);
        if (!res.ok) throw new Error(text);
        showToast("✅ Accessibility Audit Report sent to GitHub", "success");
    } catch (err) {
        console.error("GitHub Audit Report failed:", err);
        showToast(`GitHub error: ${err.message}`, "error");
    }
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

export {
    uploadImageToGitHub,
    sendToGitHub,
    sendToGitHub_A11Y,
    sendToGitHub_AuditReport
};