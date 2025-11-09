export function log(...args) {
    console.log("[QA-Copilot]", ...args);
}

export function logError(context, error) {
    console.error(`❌ [${context}]`, error);
    chrome.storage.local.get("errorLog", ({ errorLog = [] }) => {
        errorLog.push({ context, message: error.message, time: new Date().toISOString() });
        chrome.storage.local.set({ errorLog });
    });
}
