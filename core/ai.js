// ===== AI SUMMARY GENERATOR (supports OpenAI + Gemini) =====
async function generateBugSummary(title, description, severity = "Unspecified") {
    try {
        const settings = await chrome.storage.sync.get(["apiKey", "aiProvider"]);
        let apiKey = settings.apiKey?.trim();
        if (!apiKey) {
            console.warn("No API key configured — skipping AI summary.");
            return null;
        }

        // Auto-detect provider by key type
        let provider = settings.aiProvider || "OpenAI GPT-4";
        if (apiKey.startsWith("AIza")) provider = "Gemini";
        if (apiKey.startsWith("sk-")) provider = "OpenAI GPT-4";

        console.log("🧠 Detected provider:", provider);

        // Stronger, safer prompt
        const prompt = `
You are an expert QA lead. Read the bug details below and summarize them **ONLY** as valid JSON.

Expected JSON structure:
{
  "title": "[Severity] <short summary> (<category>)",
  "impact": "<1–2 sentence concise explanation of what’s wrong, possible cause, or impact>"
}

Rules:
- Respond ONLY with JSON (no commentary, no code block markers, no text before or after).
- Categories may include: UI, Backend, Logic, Validation, Performance, API, Security.
- Keep title under 120 characters.
- If unsure about category, guess based on description.

Bug details:
Title: ${title}
Description: ${description}
Severity: ${severity}
`;

        // Choose provider
        if (provider.includes("OpenAI")) {
            return await callOpenAIBugSummary(apiKey, prompt);
        } else if (provider.includes("Gemini")) {
            return await callGeminiBugSummary(apiKey, prompt);
        } else {
            console.warn("Unsupported AI provider:", provider);
            return null;
        }
    } catch (err) {
        console.error("AI summary generation failed:", err);
        return null;
    }
}

// ---- OpenAI ----
async function callOpenAIBugSummary(apiKey, prompt) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a JSON-only QA summarizer. Never output anything except JSON." },
                { role: "user", content: prompt }
            ],
            max_tokens: 250,
            temperature: 0.3
        })
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log("🧠 Raw OpenAI summary result:", data);

    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    if (!raw) {
        console.warn("⚠️ OpenAI returned no content.");
        return { title: "", impact: "" };
    }

    return parseAISummary(raw);
}

// ---- Gemini ----
async function callGeminiBugSummary(apiKey, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 250 }
        })
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log("🧠 Raw Gemini summary result:", data);

    // ✅ Extract text robustly
    let raw =
        data.candidates?.[0]?.content?.parts?.map(p => p.text).join("\n")?.trim() ||
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        "";

    // ✅ Clean up if Gemini wrapped it in code fences or prefix text
    raw = raw.replace(/```json|```/gi, "").trim();

    console.log("🧠 Gemini raw text extracted:", raw);
    return parseAISummary(raw);
}

// ---- Universal Parser ----
function parseAISummary(raw, fallbackTitle = "") {
    let cleaned = raw.trim();

    // Remove Markdown or text wrappers (common in Gemini)
    cleaned = cleaned.replace(/```(json)?/gi, "").trim();
    cleaned = cleaned.replace(/^.*?\{/, "{").replace(/\}[^}]*$/, "}").trim();

    let parsed = {};
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        console.warn("⚠️ AI JSON parse failed — fallback triggered. Raw:", cleaned);
        const titleMatch = cleaned.match(/"title"\s*:\s*"([^"]+)"/i);
        const impactMatch = cleaned.match(/"impact"\s*:\s*"([^"]+)"/i);
        parsed.title = titleMatch?.[1] || fallbackTitle;
        parsed.impact = impactMatch?.[1] || "";
    }

    if (parsed.title) parsed.title = parsed.title.replace(/^["']|["']$/g, "").trim();
    if (parsed.impact) parsed.impact = parsed.impact.replace(/^["']|["']$/g, "").trim();

    console.log("🧩 Parsed AI summary (final):", parsed);
    return parsed;
}

export {
    generateBugSummary,
    callOpenAIBugSummary,
    callGeminiBugSummary,
    parseAISummary
};