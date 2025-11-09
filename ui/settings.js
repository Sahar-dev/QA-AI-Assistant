import { showToast } from "../core/utils.js";
import { getSync, setSync } from "../core/storage.js";

export async function setupSettings() {
    document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);

    const jiraToggle = document.getElementById('toggle-jira');
    const githubToggle = document.getElementById('toggle-github');
    const jiraFields = document.getElementById('jira-settings');
    const githubFields = document.getElementById('github-settings');

    // Load saved data
    const data = await chrome.storage.sync.get([
        "jiraEnabled", "githubEnabled",
        "jiraDomain", "jiraEmail", "jiraToken", "jiraProject",
        "githubUsername", "githubRepo", "githubToken"
    ]);

    // Restore toggle states
    if (data.jiraEnabled) jiraToggle.classList.add("active");
    if (data.githubEnabled) githubToggle.classList.add("active");
    jiraFields.style.display = data.jiraEnabled ? "block" : "none";
    githubFields.style.display = data.githubEnabled ? "block" : "none";

    // Mutual exclusion logic
    jiraToggle?.addEventListener("click", async () => {
        const active = !jiraToggle.classList.contains("active");
        jiraToggle.classList.toggle("active");
        githubToggle.classList.remove("active");
        jiraFields.style.display = active ? "block" : "none";
        githubFields.style.display = "none";
        await chrome.storage.sync.set({ jiraEnabled: active, githubEnabled: false });
        showToast(active ? "🧩 Jira enabled" : "Jira disabled", "info");
    });

    githubToggle?.addEventListener("click", async () => {
        const active = !githubToggle.classList.contains("active");
        githubToggle.classList.toggle("active");
        jiraToggle.classList.remove("active");
        githubFields.style.display = active ? "block" : "none";
        jiraFields.style.display = "none";
        await chrome.storage.sync.set({ githubEnabled: active, jiraEnabled: false });
        showToast(active ? "🧩 GitHub enabled" : "GitHub disabled", "info");
    });

    // ✅ Correct credential saving with proper key mapping
    document.querySelectorAll(".integration-fields input").forEach(input => {
        input.addEventListener("change", async () => {
            const id = input.id;
            let key;

            switch (id) {
                // GitHub fields
                case "github-username": key = "githubUsername"; break;
                case "github-repo": key = "githubRepo"; break;
                case "github-token": key = "githubToken"; break;

                // Jira fields
                case "jira-domain": key = "jiraDomain"; break;
                case "jira-email": key = "jiraEmail"; break;
                case "jira-token": key = "jiraToken"; break;
                case "jira-project": key = "jiraProject"; break;

                default: key = id; // fallback
            }

            const value = input.value.trim();
            await chrome.storage.sync.set({ [key]: value });
            console.log("💾 Saved", key, "=", value);
            showToast("Saved", "success");
        });
    });

    // 🧠 Mask Passwords toggle
    const maskToggle = document.getElementById("mask-passwords-toggle");

    // Load saved value
    chrome.storage.sync.get("maskPasswords", (data) => {
        maskToggle.checked = data.maskPasswords ?? false;
    });

    // Save instantly when changed
    maskToggle.addEventListener("change", () => {
        chrome.storage.sync.set({ maskPasswords: maskToggle.checked });
        showToast(
            maskToggle.checked
                ? "🔒 Password masking enabled — passwords will appear as ***"
                : "🔓 Password masking disabled — real passwords will be recorded",
            "info"
        );
    });
}

export async function loadSettings() {
    try {
        const settings = await chrome.storage.sync.get(['apiKey', 'aiProvider', 'maskPasswords']);
        if (settings.apiKey) {
            document.getElementById('api-key').value = settings.apiKey;
        }
        if (settings.aiProvider) {
            document.getElementById('ai-provider').value = settings.aiProvider;
        }
        if (settings.maskPasswords !== undefined) {
            document.getElementById('mask-passwords-toggle').checked = settings.maskPasswords;
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings() {
    const apiKey = document.getElementById('api-key').value;
    const aiProvider = document.getElementById('ai-provider').value;
    const maskPasswords = document.getElementById('mask-passwords-toggle')?.checked || false;

    try {
        await chrome.storage.sync.set({ apiKey, aiProvider, maskPasswords });
        showToast('Settings saved!', 'success');
    } catch (error) {
        showToast('Failed to save settings', 'error');
    }
}

// ===== UTILITIES =====
export async function copyToClipboard(elementId) {
    const text = document.getElementById(elementId)?.textContent || '';

    if (!text || text.includes('will appear here')) {
        showToast('Nothing to copy', 'error');
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => showToast('Copied!', 'success'))
        .catch(() => showToast('Failed to copy', 'error'));
}
