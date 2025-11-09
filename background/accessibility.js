// background/accessibility.js
export async function analyzeAccessibility(tabId) {
    if (!tabId) return { success: false, error: "No tab ID provided" };

    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: runBasicA11yCheck,
    });
    return { success: true, results: results[0].result };
}

function runBasicA11yCheck() {
    const issues = [];
    const imgs = document.querySelectorAll("img:not([alt])");
    if (imgs.length)
        issues.push({
            type: "Missing Alt Text",
            count: imgs.length,
            impact: "High",
        });

    const inputs = Array.from(document.querySelectorAll("input")).filter((i) => {
        const id = i.id;
        return !id || !document.querySelector(`label[for='${id}']`);
    });
    if (inputs.length)
        issues.push({
            type: "Missing Labels",
            count: inputs.length,
            impact: "Medium",
        });

    return {
        totalIssues: issues.length,
        issues,
        summary:
            issues.length === 0
                ? "No major accessibility issues found"
                : `Found ${issues.length} issue(s)`,
    };
}
