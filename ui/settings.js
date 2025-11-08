import { showToast } from "../core/utils.js";
import { getSync, setSync } from "../core/storage.js";
export async function setupSettings() {
    document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);

    const toggles = ['toggle-jira', 'toggle-github'];
    toggles.forEach(id => {
        document.getElementById(id)?.addEventListener('click', function () {
            this.classList.toggle('active');
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
