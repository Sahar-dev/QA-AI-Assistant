import { showToast } from "../core/utils.js";
import { getSync, setSync } from "../core/storage.js";



export async function setupAccessibility() {
    document.getElementById('run-a11y-btn')?.addEventListener('click', handleAccessibilityAudit);
    document.getElementById('copy-a11y-btn')?.addEventListener('click', () => {
        copyToClipboard('a11y-output');
    });
}

async function handleAccessibilityAudit() {
    const output = document.getElementById('a11y-output');
    output.innerHTML = '<div class="loading"><div class="spinner"></div> Running audit...</div>';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await chrome.runtime.sendMessage({
            action: 'analyzeAccessibility',
            tabId: tab.id
        });

        if (response?.success) {
            const results = response.results;
            output.textContent = `✅ ${results.summary}\n\nIssues: ${results.totalIssues}`;
            showToast('Audit complete!', 'success');
        }
    } catch (error) {
        output.textContent = 'Error: ' + error.message;
        showToast('Audit failed', 'error');
    }
}
