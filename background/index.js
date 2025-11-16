// =============================
// QA Copilot — Background Entry
// Modular, clean, and future-proof
// =============================

import { log } from "./logger.js";
import { handleExtraction } from "./extraction.js";
import { generateTestCasesWithAI } from "./ai-generation.js";
import { analyzeAccessibility } from "./accessibility.js";
import { initRecordingHandlers } from "./recording.js";
import { saveTestToStorage, exportSessionData } from "./storage.js";
import { exportBugReport, exportTestSuite } from "./export.js";


// =============================
// INSTALLATION & INIT
// =============================
chrome.runtime.onInstalled.addListener(() => {
    log("✅ QA Copilot installed");

    chrome.sidePanel.setOptions({
        path: "sidebar.html",
        enabled: true,
    });

    chrome.storage.sync.set({
        aiProvider: "OpenAI GPT-4",
        testComplexity: "Standard",
        jiraIntegration: false,
        githubIntegration: false,
    });
});

// =============================
// ICON CLICK → OPEN SIDEPANEL
// =============================
chrome.action.onClicked.addListener(async (tab) => {
    try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        log("🧪 Side panel opened");
    } catch (error) {
        log("❌ Failed to open side panel: " + error.message);
    }
});

// =============================
// GLOBAL MESSAGE ROUTER
// =============================
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    log("📨 Received message:", req.action);
    try {
        switch (req.action) {
            // ---- Extraction ----
            case "extractPageContent":
                handleExtraction(req.tabId || sender.tab?.id)
                    .then(sendResponse)
                    .catch((err) => sendResponse({ success: false, error: err.message }));
                return true;

            // ---- AI Test Generation ----
            case "generateTestCases":
                generateTestCasesWithAI(req.data)
                    .then(sendResponse)
                    .catch((err) => sendResponse({ success: false, error: err.message }));
                return true;

            // ---- Accessibility ----
            case "analyzeAccessibility":
                analyzeAccessibility(req.tabId || sender.tab?.id)
                    .then(sendResponse)
                    .catch((err) => sendResponse({ success: false, error: err.message }));
                return true;

            // ---- Manual Recording Test Generation ----
            case "generateAutomatedTest":
                saveTestToStorage(req.framework, req.options)
                    .then(sendResponse)
                    .catch((err) => sendResponse({ success: false, error: err.message }));
                return true;

            // ---- Export Session ----
            case "exportSession":
                exportSessionData(sender, sendResponse);
                return true;

            // ---- Export Test Suite (manual trigger) ----
            case "exportTestSuite":
                exportTestSuite()
                    .then(sendResponse)
                    .catch((err) => sendResponse({ success: false, error: err.message }));
                return true;

            // ---- Export Bug Report ----
            case "exportBugReport":
                exportBugReport(req.events || [], sender.tab)
                    .then(sendResponse)
                    .catch((err) => sendResponse({ success: false, error: err.message }));
                return true;
            // ---- Recording related (handled in recording.js) ----
            case "startRecordingSession":
            case "stopRecordingSession":
            case "recordEvent":
            case "getRecordingState":
                return true;

            default:
                log(`⚠️ Unhandled message action: ${req.action}`);
                sendResponse({ success: false, error: "Unknown action" });
        }
    } catch (err) {
        log("❌ Error in background router:", err);
        sendResponse({ success: false, error: err.message });
    }


    return true;
});

// =============================
// INITIALIZE MODULES
// =============================
initRecordingHandlers();
log("🧠 Background service worker initialized successfully");
