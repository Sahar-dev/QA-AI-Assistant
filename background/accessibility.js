// =============================
// Accessibility Analyzer (MV3 Safe)
// =============================

export async function analyzeAccessibility(tabId) {
    if (!tabId) return { success: false, error: "No tab ID provided" };

    try {
        // Inject axe-core script directly into the tab DOM
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['background/axe.min.js']
        });

        // Run axe inside the page
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                return new Promise((resolve) => {
                    // axe is now available on window
                    window.axe.run(document, { resultTypes: ['violations'] }, (err, results) => {
                        if (err) resolve({ error: err.message });
                        else resolve(results);
                    });
                });
            },
        });

        return { success: true, results: result.result };
    } catch (error) {
        console.error('Accessibility scan failed:', error);
        return { success: false, error: error.message };
    }
}
