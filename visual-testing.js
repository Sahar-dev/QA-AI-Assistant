// visual-testing.js
class VisualTesting {
    static async captureElementScreenshot(selector, testCaseName) {
        const element = document.querySelector(selector);
        const screenshot = await chrome.tabs.captureVisibleTab();

        // Store baseline image
        await this.storeBaseline(testCaseName, screenshot);

        return {
            selector,
            testCaseName,
            screenshot,
            timestamp: new Date().toISOString()
        };
    }

    static async compareWithBaseline(testCaseName, newScreenshot) {
        const baseline = await this.getBaseline(testCaseName);
        const differences = await this.calculateDifferences(baseline, newScreenshot);

        return {
            match: differences < 0.01, // 1% threshold
            differencePercentage: differences,
            visualChanges: this.highlightChanges(baseline, newScreenshot)
        };
    }
}