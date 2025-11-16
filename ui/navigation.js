import { showToast } from "../core/utils.js";
import { getSync, setSync } from "../core/storage.js";
import { loadSavedTests } from "./saved-tests.js";

export async function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.tab-pane');

    async function switchTab(tabId) {
        tabs.forEach(t => t.classList.remove('active'));
        navBtns.forEach(n => n.classList.remove('active'));

        document.getElementById(tabId)?.classList.add('active');
        document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');

        const titles = {
            'test-cases': 'Test Case Generator',
            'analyze': 'Page Analyzer',
            'test-data': 'Test Recording',
            'accessibility': 'Accessibility Audit',
            'export': 'Export Tests',
            'timeline': 'Session Timeline',
            'settings': 'Settings',
            'help': 'Help & Guidance'
        };
        document.getElementById('header-title').textContent = titles[tabId] || 'QA Copilot';

        if (tabId === 'timeline') {
            try {
                const url = chrome.runtime.getURL('timeline-view.js');
                const mod = await import(url);
                mod.renderTimeline(document.getElementById('timeline-container'));
            } catch (error) {
                console.error('Timeline load failed:', error);
            }
        }
        if (tabId === 'manual-tests') {
            loadSavedTests();
        }

    }

    chrome.storage.local.get('activeTab', (data) => {
        switchTab(data.activeTab || 'test-cases');
    });

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
            chrome.storage.local.set({ activeTab: tabId });
        });
    });

    document.getElementById("help-btn")?.addEventListener("click", () => {
        switchTab("help");
        chrome.storage.local.set({ activeTab: "help" });
    });
}
