// background.js - Service Worker for Manifest V3
chrome.runtime.onInstalled.addListener(() => {
    console.log('QA AI Assistant installed');

    // Initialize default settings
    chrome.storage.sync.set({
        aiProvider: 'OpenAI GPT-4',
        testComplexity: 'Standard (Happy Path + Edge Cases)',
        jiraIntegration: true,
        githubIntegration: true,
        testRailIntegration: false,
        slackIntegration: false
    });
});

// Message handler for content script and popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractPageContent') {
        const tabId = sender.tab?.id || request.tabId;
        if (!tabId) {
            sendResponse({ success: false, error: 'No active tab found. Please open a webpage and try again.' });
            return;
        }
        handlePageExtraction(tabId)
            .then(sendResponse)
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (request.action === 'generateTestCases') {
        generateTestCasesWithAI(request.data)
            .then(sendResponse)
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }

    if (request.action === 'analyzeAccessibility') {
        const tabId = sender.tab?.id || request.tabId;
        if (!tabId) {
            sendResponse({ success: false, error: 'No active tab found. Please open a webpage and try again.' });
            return;
        }

        analyzePageAccessibility(tabId)
            .then(sendResponse)
            .catch(err => sendResponse({ error: err.message }));
        return true;
    }
});

async function handlePageExtraction(tabId) {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: extractPageData
        });

        return { success: true, data: results[0].result };
    } catch (error) {
        console.error('Page extraction failed:', error);
        return { success: false, error: error.message };
    }
}

// This function runs in the page context
function extractPageData() {
    const url = window.location.href;
    const title = document.title || '';
    const selectedText = window.getSelection().toString();

    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
        name: el.name || el.id || '',
        type: el.type || el.tagName.toLowerCase(),
        placeholder: el.placeholder || '',
        required: el.required
    }));

    const buttons = Array.from(document.querySelectorAll('button, [type="button"], [type="submit"]')).map(el => el.innerText.trim()).filter(Boolean);

    const links = Array.from(document.querySelectorAll('a')).slice(0, 5).map(a => ({
        text: a.textContent.trim(),
        href: a.href
    }));

    return {
        pageType: 'GENERIC',
        data: {
            title,
            url,
            selectedText,
            inputs,
            buttons,
            links,
            headings: Array.from(document.querySelectorAll('h1,h2,h3')).map(h => h.textContent).slice(0, 5)
        }
    };
}
async function generateTestCasesWithAI(inputData) {
    try {
        // 🔹 Load settings and API key from storage
        const settings = await new Promise(resolve => {
            chrome.storage.sync.get(['apiKey', 'aiProvider'], resolve);
        });

        const apiKey = settings?.apiKey?.trim();
        const provider = (settings?.aiProvider && settings.aiProvider.trim() !== '')
            ? settings.aiProvider
            : 'OpenAI GPT-4';


        if (!apiKey) {
            return {
                success: false,
                error: 'API key not configured. Please set it in Settings tab.'
            };
        }

        const prompt = buildTestCasePrompt(inputData);

        let apiUrl = '';
        let headers = {};
        let body = {};

        // 🔹 Route based on selected AI provider
        if (provider.includes('OpenAI')) {
            apiUrl = 'https://api.openai.com/v1/chat/completions';
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
            body = {
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are an expert QA engineer. Generate comprehensive test cases with clear steps, expected results, and cover positive, negative, edge cases, and security scenarios.'
                    },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 2000,
                temperature: 0.7
            };
        } else if (provider.includes('Gemini')) {
            // ✅ Google Gemini 2.5 Flash Free Tier endpoint (v1)
            apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
            headers = { 'Content-Type': 'application/json' };

            body = {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text:
                                    `You are a senior QA engineer.

Generate comprehensive functional, negative, edge-case, and security test cases in markdown format for the following feature:

${prompt}`
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 1200
                }
            };
        } else {
            throw new Error(`Unsupported AI provider: ${provider}`);
        }

        console.log(`Calling ${provider} API...`);

        // 🔹 Perform the API call
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`${provider} API error:`, errorData);
            const errMsg =
                errorData.error?.message ||
                errorData.error?.code ||
                `Request failed with status ${response.status}`;
            throw new Error(errMsg);
        }

        const data = await response.json();
        let aiText = '';

        // 🔹 Parse different provider responses
        if (provider.includes('OpenAI')) {
            aiText = data.choices?.[0]?.message?.content || '';
        } else if (provider.includes('Gemini')) {
            aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        if (!aiText.trim()) {
            throw new Error('Empty response from AI provider.');
        }

        return {
            success: true,
            testCases: aiText.trim()
        };
    } catch (error) {
        console.error('AI generation failed:', error);

        // 🔹 Handle quota errors gracefully
        if (error.message?.toLowerCase().includes('quota')) {
            return {
                success: true,
                testCases: generateFallbackTestCases(inputData),
                fallback: true
            };
        }

        // 🔹 Generic fallback
        return {
            success: true,
            testCases: generateFallbackTestCases(inputData),
            fallback: true,
            error: error.message
        };
    }
}


function buildTestCasePrompt(inputData) {
    return `Generate comprehensive QA test cases for this feature:

Feature: ${inputData.featureText}
Test Type: ${inputData.testType}
Risk Level: ${inputData.riskLevel}

Please include:
1. 3-5 Positive test cases (happy path)
2. 3-5 Negative test cases (error handling)
3. 2-3 Edge cases
4. Security considerations
5. Performance considerations (if applicable)

Format each test case with:
- Test Case ID
- Title
- Preconditions
- Steps (numbered)
- Expected Result
- Priority (P0-P2)`;
}

function generateFallbackTestCases(inputData) {
    const feature = inputData.featureText;
    const testType = inputData.testType;
    const riskLevel = inputData.riskLevel;

    return `🧪 TEST CASES FOR: ${feature}

Test Type: ${testType} | Risk Level: ${riskLevel}

✅ POSITIVE TEST CASES:

TC-001: Basic Functionality Verification
Priority: P0
Preconditions: System is accessible and user is logged in
Steps:
1. Navigate to the feature page
2. Verify all UI elements are displayed correctly
3. Execute the primary action
4. Observe the response/output
Expected Result: Feature works as intended without errors

TC-002: Valid Input Scenarios
Priority: P0
Preconditions: Feature is accessible
Steps:
1. Enter valid data in all required fields
2. Submit the form/request
3. Verify success message appears
4. Verify data is saved/processed correctly
Expected Result: System accepts and processes valid inputs successfully

TC-003: Multiple Operations Flow
Priority: P1
Steps:
1. Perform operation A
2. Verify result A
3. Perform operation B
4. Verify result B and integration with A
Expected Result: Sequential operations work correctly

❌ NEGATIVE TEST CASES:

TC-004: Invalid Input Handling
Priority: P0
Steps:
1. Enter invalid/malformed data
2. Attempt to submit
3. Observe error handling
Expected Result: Clear error message displayed, no system crash

TC-005: Missing Required Fields
Priority: P0
Steps:
1. Leave required fields empty
2. Attempt submission
3. Verify validation messages
Expected Result: Appropriate validation errors for all missing fields

TC-006: Unauthorized Access Attempt
Priority: P1
Steps:
1. Logout or use unauthorized account
2. Attempt to access the feature
3. Verify access control
Expected Result: Access denied with appropriate message

🔍 EDGE CASES:

TC-007: Boundary Value Testing
Priority: P1
Steps:
1. Test minimum acceptable value
2. Test maximum acceptable value  
3. Test value just below minimum
4. Test value just above maximum
Expected Result: Proper handling at boundaries, validation for out-of-range

TC-008: Special Characters and Unicode
Priority: P2
Steps:
1. Input special characters (!@#$%^&*)
2. Input unicode characters (中文, عربي, 日本語)
3. Verify proper encoding/display
Expected Result: System handles all character types correctly

🔒 SECURITY TEST CASES:

TC-009: Input Sanitization
Priority: P0 (if ${riskLevel} is HIGH/CRITICAL)
Steps:
1. Attempt SQL injection: ' OR '1'='1
2. Attempt XSS: <script>alert('test')</script>
3. Verify input is sanitized
Expected Result: No code execution, inputs are escaped/sanitized

TC-010: Session Management
Priority: P1
Steps:
1. Login and note session token
2. Logout
3. Attempt to reuse old session token
Expected Result: Session invalidated, access denied

⚡ PERFORMANCE CONSIDERATIONS:
- Response time should be < 2 seconds for ${testType} operations
- System should handle concurrent users (if applicable)
- No memory leaks during extended usage

📱 COMPATIBILITY:
- Test on Chrome, Firefox, Safari, Edge
- Test on mobile devices (iOS, Android)
- Verify responsive design

Total Test Cases: 10
Estimated Execution Time: ${estimateTestTime(riskLevel)}
Coverage: Functional, Security, Edge Cases, Performance`;
}

function estimateTestTime(riskLevel) {
    const times = {
        'Low': '30 minutes',
        'Medium': '1 hour',
        'High': '2-3 hours',
        'Critical': '4+ hours'
    };
    return times[riskLevel] || '1-2 hours';
}

async function analyzePageAccessibility(tabId) {
    try {
        // Inject axe-core accessibility testing library
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['lib/axe.min.js']
        });

        // Run accessibility scan
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: runAccessibilityScan
        });

        return { success: true, results: results[0].result };
    } catch (error) {
        console.error('Accessibility analysis failed:', error);
        return { success: false, error: error.message };
    }
}

function runAccessibilityScan() {
    // This runs in page context after axe-core is loaded
    return new Promise((resolve) => {
        if (typeof axe === 'undefined') {
            resolve({ error: 'Axe-core not loaded' });
            return;
        }

        axe.run(document, (err, results) => {
            if (err) {
                resolve({ error: err.message });
                return;
            }

            resolve({
                violations: results.violations.length,
                passes: results.passes.length,
                incomplete: results.incomplete.length,
                details: results.violations.map(v => ({
                    id: v.id,
                    impact: v.impact,
                    description: v.description,
                    help: v.help,
                    helpUrl: v.helpUrl,
                    nodes: v.nodes.length
                }))
            });
        });
    });
}