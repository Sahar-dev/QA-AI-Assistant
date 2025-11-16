// background/regression.js
import { analyzeAccessibility } from "./accessibility.js";
import { log } from "./logger.js";

const SNAPSHOT_KEY = "regressionSnapshots";
const MAX_SNAPSHOTS = 2;
const MAX_DOM_CHARS = 200000;

export async function captureRegressionSnapshot(tabId) {
    if (!tabId) {
        return { success: false, error: "No active tab to capture" };
    }

    try {
        const [artifactResult] = await chrome.scripting.executeScript({
            target: { tabId },
            func: collectRegressionArtifacts,
        });

        const artifacts = artifactResult?.result;

        if (!artifacts) {
            throw new Error("Failed to collect page artifacts");
        }

        const screenshot = await captureVisibleTab();
        const accessibility = await analyzeAccessibility(tabId);

        const snapshot = {
            id: crypto.randomUUID(),
            capturedAt: Date.now(),
            url: artifacts.url,
            title: artifacts.title,
            viewport: artifacts.viewport,
            screenshot,
            domHash: hashString(artifacts.domHTML),
            domLength: artifacts.domHTML.length,
            domSample: artifacts.domHTML.slice(0, 2000),
            textSample: artifacts.textSample,
            network: {
                customLog: artifacts.networkLog,
                resources: artifacts.resourceSummary,
            },
            console: artifacts.consoleHistory,
            runtimeErrors: artifacts.runtimeErrors,
            performanceStats: artifacts.performanceStats,
            clickIssues: artifacts.clickIssues,
            semanticSummary: artifacts.semanticSummary,
            accessibility: accessibility.success ? accessibility.results : null,
            screenshotHash: hashString(screenshot || ""),
        };

        const currentData = await chrome.storage.local.get([SNAPSHOT_KEY]);
        const existing = Array.isArray(currentData[SNAPSHOT_KEY]) ? currentData[SNAPSHOT_KEY] : [];
        const updated = [...existing, snapshot].slice(-MAX_SNAPSHOTS);
        await chrome.storage.local.set({ [SNAPSHOT_KEY]: updated });

        log("📸 Regression snapshot captured");

        return { success: true, snapshot: summarizeSnapshot(snapshot) };
    } catch (error) {
        console.error("Regression snapshot failed:", error);
        return { success: false, error: error.message };
    }
}

export async function compareRegressionSnapshots() {
    const data = await chrome.storage.local.get([SNAPSHOT_KEY]);
    const snapshots = Array.isArray(data[SNAPSHOT_KEY]) ? data[SNAPSHOT_KEY] : [];

    if (snapshots.length < 2) {
        return { success: false, error: "Capture at least two snapshots to compare." };
    }

    const previous = snapshots[snapshots.length - 2];
    const latest = snapshots[snapshots.length - 1];

    const screenshotMetrics = await computeScreenshotMetrics(previous.screenshot, latest.screenshot);
    const diff = buildDiffSummary(previous, latest, screenshotMetrics);
    const aiReport = await generateRegressionAnalysis(diff, previous, latest);

    return {
        success: true,
        diff,
        report: aiReport,
        snapshots: {
            latest: summarizeSnapshot(latest, true),
            previous: summarizeSnapshot(previous, true),
        },
    };
}

function summarizeSnapshot(snapshot, includeMedia = false) {
    if (!snapshot) return null;
    return {
        id: snapshot.id,
        capturedAt: snapshot.capturedAt,
        url: snapshot.url,
        title: snapshot.title,
        domLength: snapshot.domLength,
        domHash: snapshot.domHash,
        screenshot: includeMedia ? snapshot.screenshot : undefined,
        screenshotHash: snapshot.screenshotHash,
        networkCount: snapshot.network?.customLog?.length || 0,
        resourceCount: snapshot.network?.resources?.length || 0,
        consoleCount: snapshot.console?.length || 0,
        accessibilityCount: snapshot.accessibility?.violations?.length || 0,
        runtimeErrorCount: snapshot.runtimeErrors?.length || 0,
        clickIssueCount: snapshot.clickIssues?.length || 0,
    };
}

function buildDiffSummary(previous, latest, screenshotMetrics = {}) {
    const domDiff = computeDomDiff(previous, latest);
    const accessibilityDiff = computeAccessibilityDiff(previous, latest);
    const networkDiff = computeNetworkDiff(previous, latest);
    const logDiff = computeLogDiff(previous, latest);
    const runtimeDiff = computeRuntimeDiff(previous, latest);
    const performanceDiff = computePerformanceDiff(previous, latest);
    const semanticDiff = computeSemanticDiff(previous, latest);
    const screenshot = screenshotMetrics;

    const signals = {
        runtimeErrors: runtimeDiff.latestCount > 0,
        consoleErrors:
            runtimeDiff.consoleErrorCount > 0 ||
            runtimeDiff.newConsoleErrors.length > 0 ||
            logDiff.newErrors.length > 0,
        clickErrors: runtimeDiff.newClickIssues.length > 0,
        missingElements: semanticDiff.newMissing.length > 0,
        offscreen: semanticDiff.offscreenElements.length > 0,
        memoryLeak: performanceDiff.memoryTrend === "up" && performanceDiff.memoryDeltaBytes > 5 * 1024 * 1024,
        longTasks: performanceDiff.longTaskSpike,
        visualDelta: screenshot.diffRatio !== null && screenshot.diffRatio > 0.02,
        a11y: accessibilityDiff.newIssues.length > 0,
        apiFailures: networkDiff.newFailures.length > 0,
    };

    const stabilityScore = computeStabilityScore(signals, {
        domDiff,
        accessibilityDiff,
        networkDiff,
        logDiff,
        runtimeDiff,
        performanceDiff,
        screenshot,
    });

    const classification = determineRegressionClassification(signals, screenshot, domDiff);
    const shipDecision = determineShipDecision(signals, stabilityScore);

    return {
        dom: domDiff,
        accessibility: accessibilityDiff,
        network: networkDiff,
        logs: logDiff,
        runtime: runtimeDiff,
        performance: performanceDiff,
        semantics: semanticDiff,
        screenshot,
        stabilityScore,
        classification,
        shipDecision,
    };
}

function computeDomDiff(previous, latest) {
    const prevLength = previous.domLength || 0;
    const latestLength = latest.domLength || 0;
    const lengthChange = latestLength - prevLength;
    const changeRatio = prevLength === 0 ? 1 : Math.abs(lengthChange) / prevLength;
    const hashChanged = previous.domHash !== latest.domHash;
    const textScore = tokenDelta(previous.textSample || "", latest.textSample || "");

    return {
        hashChanged,
        lengthChange,
        changeRatio: Number(changeRatio.toFixed(4)),
        textChangeScore: textScore,
    };
}

function computeAccessibilityDiff(previous, latest) {
    const prevIssues = previous.accessibility?.violations || [];
    const latestIssues = latest.accessibility?.violations || [];

    const prevMap = new Map(prevIssues.map((issue) => [issue.id + ":" + issue.impact, issue]));
    const latestMap = new Map(latestIssues.map((issue) => [issue.id + ":" + issue.impact, issue]));

    const newIssues = Array.from(latestMap.entries())
        .filter(([key]) => !prevMap.has(key))
        .map(([, issue]) => formatAccessibilityIssue(issue))
        .slice(0, 5);

    const resolvedIssues = Array.from(prevMap.entries())
        .filter(([key]) => !latestMap.has(key))
        .map(([, issue]) => formatAccessibilityIssue(issue))
        .slice(0, 5);

    return {
        previousCount: prevIssues.length,
        latestCount: latestIssues.length,
        newIssues,
        resolvedIssues,
    };
}

function computeNetworkDiff(previous, latest) {
    const prevLog = previous.network?.customLog || [];
    const latestLog = latest.network?.customLog || [];

    const prevMap = new Map(
        prevLog.map((entry) => [normalizeEndpoint(entry.method, entry.url), entry])
    );
    const latestMap = new Map(
        latestLog.map((entry) => [normalizeEndpoint(entry.method, entry.url), entry])
    );

    const addedEndpoints = Array.from(latestMap.entries())
        .filter(([key]) => !prevMap.has(key))
        .map(([, entry]) => summarizeNetworkEntry(entry))
        .slice(0, 5);

    const removedEndpoints = Array.from(prevMap.entries())
        .filter(([key]) => !latestMap.has(key))
        .map(([, entry]) => summarizeNetworkEntry(entry))
        .slice(0, 5);

    const slowerCalls = [];
    const newFailures = [];

    for (const [key, latestEntry] of latestMap.entries()) {
        if (!prevMap.has(key)) continue;
        const prevEntry = prevMap.get(key);
        if (latestEntry.status >= 500 && (prevEntry.status || 200) < 500) {
            newFailures.push(summarizeNetworkEntry(latestEntry));
        } else if (latestEntry.timeMs && prevEntry.timeMs) {
            const delta = latestEntry.timeMs - prevEntry.timeMs;
            if (delta > 500) {
                slowerCalls.push({
                    endpoint: summarizeNetworkEntry(latestEntry),
                    deltaMs: delta,
                });
            }
        }
    }

    return {
        addedEndpoints,
        removedEndpoints,
        slowerCalls: slowerCalls.slice(0, 3),
        newFailures: newFailures.slice(0, 3),
    };
}

function computeLogDiff(previous, latest) {
    const prevLogs = previous.console || [];
    const latestLogs = latest.console || [];
    const prevSet = new Set(prevLogs.map((log) => log.digest));

    const newEntries = latestLogs.filter((log) => !prevSet.has(log.digest));
    const newErrors = newEntries.filter((log) => log.level === "error").slice(0, 5);
    const newWarnings = newEntries.filter((log) => log.level === "warn").slice(0, 5);

    return {
        newErrors,
        newWarnings,
        latestCount: latestLogs.length,
    };
}

function computeRuntimeDiff(previous, latest) {
    const prevRuntime = previous.runtimeErrors || [];
    const latestRuntime = latest.runtimeErrors || [];
    const prevRuntimeKeys = new Set(prevRuntime.map(runtimeSignature));
    const newRuntimeErrors = latestRuntime
        .filter((err) => !prevRuntimeKeys.has(runtimeSignature(err)))
        .slice(0, 10);

    const prevConsoleErrors = (previous.console || []).filter((log) => log.level === "error");
    const latestConsoleErrors = (latest.console || []).filter((log) => log.level === "error");
    const prevConsoleKeys = new Set(prevConsoleErrors.map((log) => log.digest));
    const newConsoleErrors = latestConsoleErrors
        .filter((log) => !prevConsoleKeys.has(log.digest))
        .slice(0, 10);

    const prevClick = previous.clickIssues || [];
    const latestClick = latest.clickIssues || [];
    const prevClickKeys = new Set(prevClick.map(clickSignature));
    const newClickIssues = latestClick
        .filter((issue) => !prevClickKeys.has(clickSignature(issue)))
        .slice(0, 10);

    return {
        latestCount: latestRuntime.length,
        newErrors: newRuntimeErrors,
        consoleErrorCount: latestConsoleErrors.length,
        newConsoleErrors,
        clickErrorCount: latestClick.length,
        newClickIssues,
    };
}

function computePerformanceDiff(previous, latest) {
    const prevStats = previous.performanceStats || { memory: [], longTasks: [] };
    const latestStats = latest.performanceStats || { memory: [], longTasks: [] };

    const prevMemAvg = averageMemory(prevStats.memory);
    const latestMemAvg = averageMemory(latestStats.memory);
    const memoryDelta = latestMemAvg - prevMemAvg;
    const memoryTrend = memoryDelta > 0 ? "up" : memoryDelta < 0 ? "down" : "flat";

    const prevLongTasks = prevStats.longTasks?.length || 0;
    const latestLongTasks = latestStats.longTasks?.length || 0;
    const longTaskSpike =
        latestLongTasks > prevLongTasks + 5 ||
        (latestStats.longTasks || []).some((entry) => entry.duration > 200);

    const maxLongTask = (latestStats.longTasks || []).reduce(
        (acc, entry) => Math.max(acc, entry.duration || 0),
        0
    );

    return {
        memoryDeltaBytes: memoryDelta,
        memoryTrend,
        latestAvgHeap: latestMemAvg,
        longTaskSpike,
        longTaskDelta: latestLongTasks - prevLongTasks,
        maxLongTask,
    };
}

function computeSemanticDiff(previous, latest) {
    const prevSummary = previous.semanticSummary || { counts: {}, missingCritical: [], flaggedElements: [] };
    const latestSummary = latest.semanticSummary || { counts: {}, missingCritical: [], flaggedElements: [] };

    const diffCounts = {};
    const allKeys = new Set([
        ...Object.keys(prevSummary.counts || {}),
        ...Object.keys(latestSummary.counts || {}),
    ]);
    allKeys.forEach((key) => {
        diffCounts[key] =
            (latestSummary.counts?.[key] || 0) - (prevSummary.counts?.[key] || 0);
    });

    const prevMissing = prevSummary.missingCritical || [];
    const latestMissing = latestSummary.missingCritical || [];
    const newMissing = latestMissing.filter((item) => !prevMissing.includes(item));

    const offscreenElements = latestSummary.flaggedElements || [];

    return {
        diffCounts,
        missing: latestMissing,
        newMissing,
        offscreenElements,
    };
}

async function generateRegressionAnalysis(diff, previous, latest) {
    const settings = await chrome.storage.sync.get(["apiKey", "aiProvider"]);
    const apiKey = settings.apiKey?.trim();
    const payload = buildPromptPayload(diff, previous, latest);

    const prompt = [
        "You are QA Copilot Regression Brain, an enterprise QA analyst.",
        "Follow this EXACT template (no extra sections):",
        "QA Regression Report",
        "====================",
        "",
        "1. Severity",
        "2. Exact DOM Changes",
        "3. Visual Regression Findings",
        "4. Accessibility Impact",
        "5. API & Performance Stability",
        "6. Risk Prediction (What May Break Next)",
        "7. Test Cases to Re-run",
        "8. Recommended Fixes",
        "9. Stability Score & Ship Decision",
        "",
        "Rules:",
        "- No hallucinations. Use only provided data.",
        "- Quote DOM delta %, hash changes, screenshot changes, accessibility diffs, network/log diffs, stability score.",
        "- If data missing for a category, write: \"No data provided for <category>. No analysis possible.\"",
        "- Tone: senior QA engineer, evidence-driven.",
        "",
        "Data JSON:",
        JSON.stringify(payload, null, 2),
    ].join("\n");

    if (!apiKey) {
        return buildStructuredFallbackReport(diff, previous, latest);
    }

    const provider = settings.aiProvider || "OpenAI GPT-4";

    try {
        if (provider.includes("OpenAI")) {
            return await callOpenAI(apiKey, prompt);
        }
        if (provider.includes("Gemini")) {
            return await callGemini(apiKey, prompt);
        }
        return buildStructuredFallbackReport(diff, previous, latest);
    } catch (error) {
        console.warn("AI regression analysis failed:", error);
        return buildStructuredFallbackReport(diff, previous, latest);
    }
}

async function computeScreenshotMetrics(previousDataUrl, latestDataUrl) {
    if (!previousDataUrl || !latestDataUrl || typeof OffscreenCanvas === "undefined") {
        return {
            diffRatio: null,
            ssimApprox: null,
        };
    }

    try {
        const [prevBitmap, latestBitmap] = await Promise.all([
            decodeImageBitmap(previousDataUrl),
            decodeImageBitmap(latestDataUrl),
        ]);

        const width = Math.min(prevBitmap.width, latestBitmap.width);
        const height = Math.min(prevBitmap.height, latestBitmap.height);
        if (!width || !height) {
            return { diffRatio: null, ssimApprox: null };
        }

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return { diffRatio: null, ssimApprox: null };
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(prevBitmap, 0, 0, width, height);
        const prevData = ctx.getImageData(0, 0, width, height).data;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(latestBitmap, 0, 0, width, height);
        const latestData = ctx.getImageData(0, 0, width, height).data;

        let diffPixels = 0;
        let luminanceDelta = 0;
        const totalPixels = width * height;

        for (let i = 0; i < prevData.length; i += 4) {
            const dr = Math.abs(prevData[i] - latestData[i]);
            const dg = Math.abs(prevData[i + 1] - latestData[i + 1]);
            const db = Math.abs(prevData[i + 2] - latestData[i + 2]);
            const delta = dr + dg + db;
            if (delta > 60) diffPixels++;

            const l1 = 0.299 * prevData[i] + 0.587 * prevData[i + 1] + 0.114 * prevData[i + 2];
            const l2 = 0.299 * latestData[i] + 0.587 * latestData[i + 1] + 0.114 * latestData[i + 2];
            luminanceDelta += Math.abs(l1 - l2);
        }

        const diffRatio = diffPixels / totalPixels;
        const ssimApprox = Math.max(0, 1 - luminanceDelta / (totalPixels * 255));

        return {
            diffRatio: Number(diffRatio.toFixed(4)),
            ssimApprox: Number(ssimApprox.toFixed(4)),
        };
    } catch (error) {
        console.warn("Screenshot metric computation failed:", error);
        return {
            diffRatio: null,
            ssimApprox: null,
        };
    }
}

async function decodeImageBitmap(dataUrl) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return await createImageBitmap(blob);
}

function buildStructuredFallbackReport(diff, previous, latest) {
    const severityLabel = determineSeverityLabel(diff.stabilityScore);
    const classification = diff.classification || determineRegressionClassification({}, {}, diff.dom || {});
    const domDeltaPct = ((diff.dom?.changeRatio || 0) * 100).toFixed(2);
    const screenshotInfo =
        diff.screenshot?.diffRatio !== null
            ? `Pixel diff ${(diff.screenshot.diffRatio * 100).toFixed(2)}%, SSIM ${diff.screenshot.ssimApprox ?? "n/a"}`
            : "No screenshot metrics provided.";

    const lines = [];
    lines.push("QA Regression Report");
    lines.push("====================\n");

    // 1 Severity
    lines.push("1. Severity");
    lines.push(
        `- Overall severity rating: ${severityLabel}`
    );
    lines.push(
        `- Based on DOM delta ${domDeltaPct}%, ${diff.accessibility.newIssues.length} new accessibility issues, ${diff.network.newFailures.length} failing API calls, and stability score ${diff.stabilityScore}%, this is classified as ${classification} regression.`
    );
    lines.push("");

    // 2 DOM
    lines.push("2. Exact DOM Changes");
    if (diff.dom) {
        lines.push(
            `- DOM hash ${diff.dom.hashChanged ? "changed" : "unchanged"}; delta ${domDeltaPct}% (${diff.dom.lengthChange || 0} nodes by size).`
        );
        lines.push(
            `- Text-token delta score ${diff.dom.textChangeScore || 0}; indicates ${
                diff.dom.textChangeScore > 0 ? "content shifts detected." : "no textual drift detected."
            }`
        );
        if (diff.semantics) {
            lines.push(
                `- Structural counts changed: ${Object.entries(diff.semantics.diffCounts || {})
                    .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`)
                    .join(", ")}`
            );
            if (diff.semantics.newMissing.length) {
                lines.push(`- Missing critical elements: ${diff.semantics.newMissing.join(", ")}`);
            }
        }
    } else {
        lines.push("No data provided for DOM changes. No analysis possible.");
    }
    lines.push("");

    // 3 Visual
    lines.push("3. Visual Regression Findings");
    lines.push(`- ${screenshotInfo}`);
    if (diff.semantics?.offscreenElements?.length) {
        lines.push(
            `- Off-screen/invisible elements detected: ${diff.semantics.offscreenElements
                .slice(0, 5)
                .map((el) => `${el.tag} (${Math.round(el.top)}px)`)}
            `.trim()
        );
    }
    lines.push("");

    // 4 Accessibility
    lines.push("4. Accessibility Impact");
    if (diff.accessibility) {
        if (diff.accessibility.newIssues.length) {
            lines.push("- New issues:");
            diff.accessibility.newIssues.forEach((issue) => lines.push(`  - ${issue}`));
        } else {
            lines.push("- No new issues reported.");
        }
        if (diff.accessibility.resolvedIssues.length) {
            lines.push("- Resolved issues:");
            diff.accessibility.resolvedIssues.forEach((issue) => lines.push(`  - ${issue}`));
        } else {
            lines.push("- No resolved issues reported.");
        }
    } else {
        lines.push("No data provided for accessibility. No analysis possible.");
    }
    lines.push("");

    // 5 API & Performance
    lines.push("5. API & Performance Stability");
    if (diff.network) {
        lines.push(`- New API calls: ${diff.network.addedEndpoints.length || 0}`);
        lines.push(`- Removed API calls: ${diff.network.removedEndpoints.length || 0}`);
        lines.push(`- New failures: ${diff.network.newFailures.length || 0}`);
        lines.push(
            diff.network.slowerCalls.length
                ? `- Slower calls: ${diff.network.slowerCalls
                      .map((call) => `${call.endpoint} (+${call.deltaMs}ms)`)
                      .join("; ")}`
                : "- No slower API calls logged."
        );
    } else {
        lines.push("No data provided for api_network. No analysis possible.");
    }
    if (diff.runtime) {
        lines.push(
            `- Runtime errors: ${diff.runtime.latestCount} current (${diff.runtime.newErrors.length} new since baseline)`
        );
        lines.push(
            `- Console errors: ${diff.runtime.consoleErrorCount} current (${diff.runtime.newConsoleErrors.length} new)`
        );
        lines.push(`- Click handler issues: ${diff.runtime.newClickIssues.length}`);
    } else {
        lines.push("No data provided for runtime_errors. No analysis possible.");
    }
    if (diff.performance) {
        lines.push(
            `- Memory trend: ${diff.performance.memoryTrend} (${formatBytes(diff.performance.memoryDeltaBytes)} delta)`
        );
        lines.push(
            `- Long tasks delta: ${diff.performance.longTaskDelta} (max ${diff.performance.maxLongTask.toFixed(
                1
            )}ms)`
        );
    } else {
        lines.push("No data provided for performance metrics. No analysis possible.");
    }
    lines.push("");

    // 6 Risk Prediction
    lines.push("6. Risk Prediction (What May Break Next)");
    const risks = deriveRiskPredictions(diff);
    if (risks.length) {
        risks.forEach((risk) => lines.push(`- ${risk}`));
    } else {
        lines.push("No evidence provided for risk prediction.");
    }
    lines.push("");

    // 7 Test Cases
    lines.push("7. Test Cases to Re-run");
    const tests = deriveTestRecommendations(diff);
    if (tests.length) {
        tests.forEach((test) => lines.push(`- ${test}`));
    } else {
        lines.push("No evidence provided for test coverage.");
    }
    lines.push("");

    // 8 Recommended Fixes
    lines.push("8. Recommended Fixes");
    const fixes = deriveFixRecommendations(diff);
    if (fixes.length) {
        fixes.forEach((fix) => lines.push(`- ${fix}`));
    } else {
        lines.push("No actionable fixes available from provided data.");
    }
    lines.push("");

    // 9 Stability score
    lines.push("9. Stability Score & Ship Decision");
    lines.push(
        `- Stability score: ${diff.stabilityScore}% — ${stabilityDecision(diff.stabilityScore)}`
    );

    return lines.join("\n");
}

function determineSeverityLabel(stabilityScore = 100) {
    if (stabilityScore >= 80) return "Low";
    if (stabilityScore >= 60) return "Moderate";
    if (stabilityScore >= 40) return "High";
    return "Critical";
}

function computeStabilityScore(signals, context = {}) {
    let score = 100;
    if (signals.runtimeErrors) score -= 40;
    if (signals.consoleErrors) score -= 15;
    if (signals.clickErrors) score -= 25;
    if (signals.apiFailures) score -= 25;
    if (signals.memoryLeak) score -= 15;
    if (signals.longTasks) score -= 10;
    if (signals.missingElements) score -= 20;
    if (signals.offscreen) score -= 10;
    if (signals.visualDelta) score -= 10;
    if (signals.a11y) score -= 10;

    score -= Math.min(20, Math.round((context.domDiff?.changeRatio || 0) * 100 * 0.8));
    score -= Math.min(15, (context.networkDiff?.newFailures?.length || 0) * 3);
    score -= Math.min(10, (context.logs?.newErrors?.length || 0) * 2);

    return Math.max(0, Math.min(100, score));
}

function determineRegressionClassification(signals = {}, screenshot = {}, domDiff = {}) {
    if (signals.runtimeErrors || signals.clickErrors || signals.apiFailures) return "Functional";
    if (signals.missingElements || signals.offscreen) return "Structural";
    if (signals.visualDelta || (domDiff.changeRatio || 0) > 0.05 || (screenshot.diffRatio || 0) > 0.05) {
        return "Structural";
    }
    if (signals.a11y) return "Accessibility";
    return "Cosmetic";
}

function determineShipDecision(signals, stabilityScore) {
    if (signals.runtimeErrors || signals.clickErrors || signals.apiFailures) {
        return "❌ DO NOT SHIP - Critical functional regressions detected";
    }
    if (signals.missingElements || signals.offscreen) {
        return "⚠️ REVIEW REQUIRED - Content missing or off-screen";
    }
    if (signals.memoryLeak || signals.longTasks) {
        return "⚠️ REVIEW REQUIRED - Performance degradation detected";
    }
    if (stabilityScore >= 95 && !signals.visualDelta && !signals.a11y && !signals.consoleErrors) {
        return "✅ Low risk - Safe to ship";
    }
    if (stabilityScore < 80) {
        return "⚠️ REVIEW REQUIRED - Stability score below threshold";
    }
    return "⚠️ REVIEW REQUIRED";
}

function deriveRiskPredictions(diff) {
    const risks = [];
    if (diff.dom?.changeRatio > 0.05) {
        risks.push(`Elevated DOM churn (${(diff.dom.changeRatio * 100).toFixed(2)}%) risks layout regressions.`);
    }
    if (diff.accessibility?.newIssues?.length) {
        risks.push("New accessibility violations will block assistive technology users.");
    }
    if (diff.network?.newFailures?.length) {
        risks.push("Fresh API failures can cascade to downstream workflows consuming those endpoints.");
    }
    if (diff.logs?.newErrors?.length || diff.runtime?.newConsoleErrors?.length) {
        risks.push("Console/runtime errors indicate scripts crashing during user flows.");
    }
    if (diff.performance?.memoryTrend === "up") {
        risks.push("Rising heap usage suggests potential memory leaks over longer sessions.");
    }
    if (diff.semantics?.newMissing?.length) {
        risks.push(`Missing critical content (${diff.semantics.newMissing.join(", ")}) will block feature parity.`);
    }
    if (diff.semantics?.offscreenElements?.length) {
        risks.push("Critical elements rendered off-screen reduce usability.");
    }
    if (diff.runtime?.newClickIssues?.length) {
        risks.push("Click handler exceptions will break CTA interactions.");
    }
    return risks;
}

function deriveTestRecommendations(diff) {
    const tests = [];
    if (diff.dom?.hashChanged) tests.push("UI regression suite covering modified screens");
    if (diff.network?.addedEndpoints?.length) tests.push("API regression tests for new endpoints");
    if (diff.network?.newFailures?.length) tests.push("Error-path tests for failing APIs");
    if (diff.accessibility?.newIssues?.length) tests.push("Accessibility smoke tests on impacted views");
    if (diff.runtime?.newClickIssues?.length) tests.push("Interactive smoke tests on affected CTAs");
    if (diff.performance?.memoryTrend === "up") tests.push("Long-duration performance soak tests");
    if (diff.semantics?.newMissing?.length) tests.push("Visual verification tests for hero/media content");
    if (!tests.length) return [];
    return tests;
}

function deriveFixRecommendations(diff) {
    const fixes = [];
    if (diff.accessibility?.newIssues?.length) {
        fixes.push("Resolve newly introduced accessibility violations before release.");
    }
    if (diff.network?.newFailures?.length) {
        fixes.push("Investigate API responses for failing endpoints and restore previous status codes.");
    }
    if (diff.logs?.newErrors?.length) {
        fixes.push("Address console errors to avoid runtime breaks.");
    }
    if (diff.runtime?.newErrors?.length) {
        fixes.push("Debug runtime exceptions captured during the snapshot window.");
    }
    if (diff.runtime?.newClickIssues?.length) {
        fixes.push("Harden click handlers to prevent CTA crashes.");
    }
    if (diff.semantics?.newMissing?.length) {
        fixes.push(`Restore missing content: ${diff.semantics.newMissing.join(", ")}.`);
    }
    if (diff.semantics?.offscreenElements?.length) {
        fixes.push("Reposition off-screen elements back into the viewport.");
    }
    if (diff.performance?.memoryTrend === "up") {
        fixes.push("Investigate memory leaks by profiling heap allocations.");
    }
    if (!fixes.length) return [];
    return fixes;
}

function stabilityDecision(score = 100) {
    if (score >= 80) return "Safe to ship with spot visual review.";
    if (score >= 60) return "Requires targeted regression before ship.";
    return "Hold release until regressions resolved.";
}

function buildPromptPayload(diff, previous, latest) {
    return {
        stabilityScore: diff.stabilityScore,
        dom: diff.dom,
        accessibility: diff.accessibility,
        network: diff.network,
        logs: diff.logs,
        runtime: diff.runtime,
        performance: diff.performance,
        semantics: diff.semantics,
        screenshot: diff.screenshot,
        classification: diff.classification,
        shipDecision: diff.shipDecision,
        meta: {
            previous: {
                url: previous.url,
                capturedAt: previous.capturedAt,
            },
            latest: {
                url: latest.url,
                capturedAt: latest.capturedAt,
            },
        },
    };
}

async function captureVisibleTab() {
    return new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(dataUrl);
            }
        });
    });
}

function normalizeEndpoint(method = "GET", url = "") {
    try {
        const parsed = new URL(url, "https://placeholder.local");
        const sanitized = parsed.pathname.replace(/\/\d+/g, "/{id}");
        return `${method.toUpperCase()} ${sanitized}`;
    } catch {
        return `${method.toUpperCase()} ${url}`;
    }
}

function summarizeNetworkEntry(entry = {}) {
    return `${(entry.method || "GET").toUpperCase()} ${entry.url || ""} (${entry.status || "pending"} / ${
        entry.timeMs ? entry.timeMs + "ms" : "-"
    })`.trim();
}

function formatAccessibilityIssue(issue = {}) {
    return `${issue.id || "rule"} (${issue.impact || "impact"}) - ${issue.help || issue.description || "No description"}`;
}

function tokenDelta(a, b) {
    const tokensA = new Set(
        a
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .split(/\s+/)
            .filter(Boolean)
    );
    const tokensB = new Set(
        b
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .split(/\s+/)
            .filter(Boolean)
    );
    if (!tokensA.size && !tokensB.size) return 0;
    let overlap = 0;
    for (const token of tokensB) {
        if (tokensA.has(token)) overlap++;
    }
    const unionSize = new Set([...tokensA, ...tokensB]).size;
    return Number((1 - overlap / Math.max(unionSize, 1)).toFixed(4));
}

function hashString(input = "") {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString();
}

async function callOpenAI(apiKey, prompt) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are an expert QA architect who writes concise Markdown reports." },
                { role: "user", content: prompt },
            ],
            temperature: 0.2,
            max_tokens: 800,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `OpenAI HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
}

async function callGemini(apiKey, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 800,
            },
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `Gemini HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n")?.trim() || "";
}

function collectRegressionArtifacts() {
    const MAX_DOM_CHARS = 200000;
    try {
        const html = (document.documentElement?.outerHTML || "").slice(0, MAX_DOM_CHARS);
        const textSample = (document.body?.innerText || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 4000);
        const resourceSummary = performance
            .getEntriesByType("resource")
            .slice(-50)
            .map((entry) => ({
                name: entry.name,
                initiatorType: entry.initiatorType,
                transferSize: entry.transferSize,
                duration: Math.round(entry.duration),
            }));

        const semanticCounts = {
            videos: document.querySelectorAll("video").length,
            heroSections: document.querySelectorAll("[data-hero], .hero, section.hero, .HeroSection").length,
            interactive: document.querySelectorAll("button, a[href], [role='button'], input[type='submit'], input[type='button']").length,
            mediaSections: document.querySelectorAll("section, article").length,
            images: document.querySelectorAll("img").length,
        };

        const missingCritical = [];
        if (!semanticCounts.heroSections) missingCritical.push("hero");
        if (!semanticCounts.videos) missingCritical.push("video");

        const offscreenElements = Array.from(
            document.querySelectorAll("video, [data-hero], section, header, footer, button, [role='button'], [data-critical]")
        )
            .map((el) => {
                const rect = el.getBoundingClientRect();
                return {
                    tag: el.tagName,
                    text: el.textContent?.trim().slice(0, 80) || "",
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                    offscreen: rect.bottom < -500 || rect.top > window.innerHeight * 4 || Math.abs(rect.left) > window.innerWidth * 4,
                    invisible: rect.width * rect.height === 0,
                };
            })
            .filter((entry) => entry.offscreen || entry.invisible)
            .slice(0, 30);

        const semanticSummary = {
            counts: semanticCounts,
            missingCritical,
            flaggedElements: offscreenElements,
        };

        return {
            url: location.href,
            title: document.title,
            domHTML: html,
            textSample,
            networkLog: Array.isArray(window.__qaNetworkLog)
                ? window.__qaNetworkLog.slice(-100)
                : [],
            consoleHistory: Array.isArray(window.__qaConsoleHistory)
                ? window.__qaConsoleHistory.slice(-100)
                : [],
            runtimeErrors: Array.isArray(window.__qaRuntimeErrors)
                ? window.__qaRuntimeErrors.slice(-100)
                : [],
            performanceStats: window.__qaPerfStats || { memory: [], longTasks: [] },
            clickIssues: Array.isArray(window.__qaClickIssues)
                ? window.__qaClickIssues.slice(-100)
                : [],
            semanticSummary,
            resourceSummary,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
            },
        };
    } catch (error) {
        return {
            url: location.href,
            title: document.title,
            domHTML: "",
            textSample: "",
            networkLog: [],
            consoleHistory: [],
            runtimeErrors: [],
            performanceStats: { memory: [], longTasks: [] },
            clickIssues: [],
            semanticSummary: { counts: {}, missingCritical: [], flaggedElements: [] },
            resourceSummary: [],
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
            },
            error: error.message,
        };
    }
}

function runtimeSignature(error) {
    return `${error.message || ""}:${error.source || ""}:${error.line || ""}:${error.column || ""}`;
}

function clickSignature(issue) {
    return `${issue.selector || ""}:${issue.message || ""}:${issue.phase || ""}`;
}

function averageMemory(samples = []) {
    if (!samples.length) return 0;
    const total = samples.reduce((sum, sample) => sum + (sample.usedJSHeapSize || 0), 0);
    return total / samples.length;
}

function formatBytes(bytes = 0) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)));
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(1)} ${units[index]}`;
}
