// background/ai-generation.js
import { buildPrompt, generateFallbackTests } from "./utils.js";
export async function generateTestCasesWithAI(inputData) {
    try {
        // Load settings
        const settings = await chrome.storage.sync.get(['apiKey', 'aiProvider']);

        const apiKey = settings.apiKey?.trim();
        if (!apiKey) {
            throw new Error('API key not configured. Please set it in Settings.');
        }

        const provider = settings.aiProvider || 'OpenAI GPT-4';
        const prompt = buildPrompt(inputData);

        let response;

        if (provider.includes('OpenAI')) {
            response = await callOpenAI(apiKey, prompt);
        } else if (provider.includes('Gemini')) {
            response = await callGemini(apiKey, prompt);
        } else {
            throw new Error('Unsupported AI provider: ' + provider);
        }

        return { success: true, testCases: response };

    } catch (error) {
        console.error('AI generation failed:', error);

        // Fallback to rule-based generation
        return {
            success: true,
            testCases: generateFallbackTests(inputData),
            fallback: true,
            error: error.message
        };
    }
}

async function callOpenAI(apiKey, prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert QA engineer. Generate comprehensive, well-structured test cases.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 2000,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

async function callGemini(apiKey, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                role: 'user',
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 1500
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}
