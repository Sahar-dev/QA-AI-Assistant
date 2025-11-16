// ui/test-data.js
import { showToast, copyToClipboard } from "../core/utils.js";

export function setupTestData() {
    const genBtn = document.getElementById("generate-data-btn");
    const copyBtn = document.getElementById("copy-data-btn");
    const outputEl = document.getElementById("data-output");

    genBtn?.addEventListener("click", handleGenerate);
    copyBtn?.addEventListener("click", handleCopy);

    async function handleGenerate() {
        try {
            const schemaInput = document.getElementById("data-schema").value.trim();
            const count = parseInt(document.getElementById("record-count").value) || 5;
            const format = document.getElementById("data-format").value;
            const schema = JSON.parse(schemaInput);

            const data = generateData(schema, count, format);
            outputEl.innerHTML = `
        <pre style="background:#f9fafb;padding:12px;border-radius:6px;overflow-x:auto;">${JSON.stringify(data, null, 2)}</pre>
      `;
            showToast(`✅ Generated ${count} records (${format})`, "success");
        } catch (err) {
            console.error(err);
            showToast("❌ Invalid schema or generation error", "error");
        }
    }

    function handleCopy() {
        const pre = outputEl.querySelector("pre");
        if (!pre) {
            showToast("Nothing to copy", "warning");
            return;
        }
        navigator.clipboard.writeText(pre.textContent);
        showToast("📋 Data copied to clipboard", "success");
    }
}

/**
 * Core generator
 */
function generateData(schema, count, format) {
    const faker = window.faker || null;
    const results = [];

    for (let i = 0; i < count; i++) {
        const record = {};
        for (const [key, type] of Object.entries(schema)) {
            record[key] = generateValue(type, format, faker);
        }
        results.push(record);
    }
    return results;
}

/**
 * Smart value generator
 */
function generateValue(type, format, faker) {
    const rand = Math.random();
    const makeInvalid = format === "Invalid Data";
    const makeEdge = format === "Edge Cases";

    switch (type.toLowerCase()) {
        case "string":
            if (makeInvalid) return rand < 0.3 ? "" : 12345;
            if (makeEdge) return "a".repeat(256);
            return `text_${Math.random().toString(36).slice(2, 8)}`;
        case "email":
            if (makeInvalid) return "invalid-email";
            if (makeEdge) return "a".repeat(64) + "@example.com";
            return `user${Math.floor(rand * 999)}@example.com`;
        case "number":
            if (makeInvalid) return "NaN";
            if (makeEdge) return 9999999999;
            return Math.floor(rand * 100);
        case "boolean":
            return rand > 0.5;
        case "date":
            if (makeEdge) return "1900-01-01";
            return new Date(Date.now() - rand * 1e10).toISOString().split("T")[0];
        default:
            return type; // fallback: literal type string
    }
}
