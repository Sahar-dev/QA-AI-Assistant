import { loadSavedTests } from "./saved-tests.js";

export function setupNavigation() {
    const navBtns = document.querySelectorAll(".nav-btn");
    const tabs = document.querySelectorAll(".tab-pane");
    const header = document.getElementById("header-title");

    const titles = {
        "test-cases": "Test Case Generator",
        analyze: "Page Analyzer",
        "test-data": "Test Recording",
        accessibility: "Accessibility Audit",
        export: "Export Tests",
        "manual-tests": "Manual Recorder",
        settings: "Settings",
        help: "Help & Guidance",
    };

    async function switchTab(tabId) {
        if (!tabId) return;

        console.log("Switching to tab:", tabId); // Debug log

        tabs.forEach((pane) => pane.classList.remove("active"));
        navBtns.forEach((btn) => btn.classList.remove("active"));

        const targetPane = document.getElementById(tabId);
        const targetBtn = document.querySelector(`[data-tab="${tabId}"]`);

        if (targetPane) {
            targetPane.classList.add("active");
            console.log("✅ Tab pane activated:", tabId);
        } else {
            console.error("❌ Tab pane not found:", tabId);
        }

        if (targetBtn) {
            targetBtn.classList.add("active");
        } else {
            console.warn("⚠️ Tab button not found:", tabId);
        }

        if (header) {
            header.textContent = titles[tabId] || "QA Copilot";
        }

        if (tabId === "manual-tests") {
            loadSavedTests();
        } else if (tabId === "timeline") {
            try {
                const url = chrome.runtime.getURL("timeline-view.js");
                const mod = await import(url);
                mod.renderTimeline(document.getElementById("timeline-container"));
            } catch (error) {
                console.error("Timeline load failed:", error);
            }
        }

        chrome.storage?.local?.set?.({ activeTab: tabId });
    }
    chrome.storage?.local?.get("activeTab", (data = {}) => {
        switchTab(data.activeTab || "test-cases");
    });

    navBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const tabId = btn.dataset.tab;
            if (!tabId) return;
            switchTab(tabId);
        });
    });

    document.getElementById("help-btn")?.addEventListener("click", () => {
        switchTab("help");
    });
}
