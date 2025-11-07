// background.js - Service Worker (Fixed & Optimized)

// ===== INITIALIZATION =====
chrome.runtime.onInstalled.addListener(() => {
    console.log('✅ QA Copilot installed');

    // Enable side panel
    chrome.sidePanel.setOptions({
        path: 'sidebar.html',
        enabled: true
    });

    // Initialize default settings
    chrome.storage.sync.set({
        aiProvider: 'OpenAI GPT-4',
        testComplexity: 'Standard',
        jiraIntegration: false,
        githubIntegration: false
    });
});

// Open side panel on icon click
chrome.action.onClicked.addListener(async (tab) => {
    try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        console.log('🧪 Side panel opened');
    } catch (error) {
        console.error('Failed to open side panel:', error);
    }
});

// ===== MESSAGE HANDLER =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Received message:', request.action);

    if (request.action === 'extractPageContent') {
        handlePageExtraction(request.tabId || sender.tab?.id)
            .then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep channel open
    }

    if (request.action === 'generateTestCases') {
        generateTestCasesWithAI(request.data)
            .then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === 'analyzeAccessibility') {
        analyzeAccessibility(request.tabId || sender.tab?.id)
            .then(sendResponse)
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

// ===== PAGE EXTRACTION =====
async function handlePageExtraction(tabId) {
    if (!tabId) {
        return { success: false, error: 'No tab ID provided' };
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: extractPageData
        });

        if (!results || !results[0]) {
            throw new Error('Script execution failed');
        }

        return { success: true, data: results[0].result };
    } catch (error) {
        console.error('Extraction error:', error);
        return { success: false, error: error.message };
    }
}

// This function runs IN the page context
function extractPageData() {
    const url = window.location.href;
    const title = document.title || '';
    const selectedText = window.getSelection().toString();

    // Extract form inputs
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'))
        .slice(0, 20) // Limit to first 20
        .map(el => ({
            name: el.name || el.id || el.placeholder || 'unnamed',
            type: el.type || el.tagName.toLowerCase(),
            placeholder: el.placeholder || '',
            required: el.required || false
        }));

    // Extract buttons
    const buttons = Array.from(document.querySelectorAll('button, [type="submit"], [type="button"]'))
        .slice(0, 10)
        .map(btn => btn.textContent.trim())
        .filter(text => text && text.length < 50);

    // Extract links
    const links = Array.from(document.querySelectorAll('a[href]'))
        .slice(0, 10)
        .map(a => ({
            text: a.textContent.trim().substring(0, 50),
            href: a.href
        }))
        .filter(link => link.text);

    // Extract headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .slice(0, 10)
        .map(h => h.textContent.trim())
        .filter(text => text);

    return {
        pageType: 'GENERIC',
        data: {
            title,
            url,
            selectedText,
            inputs,
            buttons,
            links,
            headings
        }
    };
}

// ===== AI TEST GENERATION =====
async function generateTestCasesWithAI(inputData) {
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

function buildPrompt(inputData) {
    return `Generate comprehensive test cases for this feature:

Feature: ${inputData.featureText}
Test Type: ${inputData.testType}
Risk Level: ${inputData.riskLevel}

Include:
1. 3-5 Positive test cases (happy path scenarios)
2. 3-5 Negative test cases (error handling)
3. 2-3 Edge cases (boundary conditions)
4. Security considerations
5. Performance notes (if applicable)

Format each test case:
- Test ID: TC-XXX
- Title: Clear, descriptive title
- Priority: P0/P1/P2
- Preconditions: What must be true before test
- Steps: Numbered, specific actions
- Expected Result: Clear success criteria`;
}

function generateFallbackTests(inputData) {
    const { featureText, testType, riskLevel } = inputData;

    return `🧪 TEST CASES FOR: ${featureText}

Test Type: ${testType} | Risk Level: ${riskLevel}

✅ POSITIVE TESTS

TC-001: Basic Functionality
Priority: P0
Preconditions: Application is accessible
Steps:
1. Navigate to the feature
2. Verify all UI elements are visible
3. Execute the primary action
4. Verify expected outcome
Expected: Feature works as designed

TC-002: Valid Input Handling
Priority: P0
Steps:
1. Enter valid data in all fields
2. Submit the form/action
3. Verify success message
4. Confirm data is processed
Expected: System accepts valid inputs

TC-003: Sequential Operations
Priority: P1
Steps:
1. Complete operation A successfully
2. Verify state change
3. Complete operation B
4. Verify operations integrate correctly
Expected: Multi-step workflows succeed

❌ NEGATIVE TESTS

TC-004: Invalid Input Handling
Priority: P0
Steps:
1. Enter invalid/malformed data
2. Attempt submission
3. Verify error handling
Expected: Clear error messages, no crash

TC-005: Required Field Validation
Priority: P0
Steps:
1. Leave required fields empty
2. Attempt submission
3. Check validation messages
Expected: All required fields flagged

TC-006: Unauthorized Access
Priority: P1
Steps:
1. Logout or use restricted account
2. Attempt to access feature
3. Verify access control
Expected: Access denied appropriately

🔍 EDGE CASES

TC-007: Boundary Values
Priority: P1
Steps:
1. Test minimum acceptable value
2. Test maximum acceptable value
3. Test min-1 and max+1
Expected: Proper boundary validation

TC-008: Special Characters
Priority: P2
Steps:
1. Input special chars: !@#$%^&*
2. Input unicode: 中文, عربي
3. Verify handling
Expected: All characters processed safely

🔒 SECURITY CHECKS

TC-009: Input Sanitization
Priority: P0 (if risk is HIGH)
Steps:
1. Attempt SQL injection
2. Attempt XSS attack
3. Verify inputs are sanitized
Expected: No code execution

TC-010: Session Security
Priority: P1
Steps:
1. Login and capture session
2. Logout
3. Try to reuse old session
Expected: Session invalidated

⚡ PERFORMANCE NOTES
- Response time target: < 2 seconds
- Handle concurrent users gracefully
- No memory leaks during extended use

📱 COMPATIBILITY
- Test on Chrome, Firefox, Safari, Edge
- Mobile: iOS Safari, Chrome Android
- Responsive design validation

Total: 10 test cases
Est. Time: ${riskLevel === 'High' || riskLevel === 'Critical' ? '3-4 hours' : '1-2 hours'}`;
}

// ===== ACCESSIBILITY ANALYSIS =====
async function analyzeAccessibility(tabId) {
    if (!tabId) {
        return { success: false, error: 'No tab ID provided' };
    }

    try {
        // Basic accessibility check without axe-core
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: runBasicA11yCheck
        });

        return { success: true, results: results[0].result };
    } catch (error) {
        console.error('A11y analysis failed:', error);
        return { success: false, error: error.message };
    }
}

function runBasicA11yCheck() {
    const issues = [];

    // Check images without alt
    const imagesWithoutAlt = document.querySelectorAll('img:not([alt])');
    if (imagesWithoutAlt.length > 0) {
        issues.push({
            type: 'Missing Alt Text',
            count: imagesWithoutAlt.length,
            impact: 'High',
            description: 'Images found without alt attributes'
        });
    }

    // Check form inputs without labels
    const inputsWithoutLabels = Array.from(document.querySelectorAll('input')).filter(input => {
        const id = input.id;
        return !id || !document.querySelector(`label[for="${id}"]`);
    });

    if (inputsWithoutLabels.length > 0) {
        issues.push({
            type: 'Missing Form Labels',
            count: inputsWithoutLabels.length,
            impact: 'Medium',
            description: 'Form inputs without associated labels'
        });
    }

    // Check buttons without text
    const emptyButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
        return !btn.textContent.trim() && !btn.getAttribute('aria-label');
    });

    if (emptyButtons.length > 0) {
        issues.push({
            type: 'Empty Buttons',
            count: emptyButtons.length,
            impact: 'High',
            description: 'Buttons without text or aria-label'
        });
    }

    return {
        totalIssues: issues.length,
        issues: issues,
        summary: issues.length === 0 ? 'No major issues found' : `Found ${issues.length} accessibility issues`
    };
}

const SESSION_WINDOW_MS = 5 * 60 * 1000;
const sessionBuffers = new Map();
let lastActivePageTab = null;
let isRecording = false;
let recordedEvents = [];

// === Utility ===
function pushSessionEvent(tabId, evt) {
    if (!tabId) return;
    lastActivePageTab = tabId;
    const now = Date.now();
    const arr = sessionBuffers.get(tabId) || [];
    arr.push({ ...evt, t: now });
    const cutoff = now - SESSION_WINDOW_MS;
    while (arr.length && arr[0].t < cutoff) arr.shift();
    sessionBuffers.set(tabId, arr);

    if (isRecording) {
        recordedEvents.push({ ...evt, t: now });
    }
}

function generateTestFromEvents(framework, events = [], options = {}) {
    if (!events.length) return "// No recorded events found.";

    const meta = events.metadata || {};
    const fw = framework?.toLowerCase() || "cypress";

    const config = {
        keepAllAttempts: options.keepAllAttempts ?? false,
        includeNetworkCalls: options.includeNetworkCalls ?? false,
        includeAssertions: options.includeAssertions ?? true,
        includeHovers: options.includeHovers ?? false,
        includeScrolls: options.includeScrolls ?? false,
        ...options
    };

    // ===== 1. CLEAN & SORT =====
    let cleaned = events.filter(e => {
        if (!e || !e.type) return false;
        if (['keydown', 'keyup', 'mouse_move'].includes(e.type)) return false;

        const selector = e.data?.selector || "";
        if (selector.startsWith("> body") || selector === "body") return false;

        return true;
    });

    // Sort: navigation first
    const navEvent = cleaned.find(e => e.type === "navigation" && !e.data?.href?.includes("cloudflare"));
    const otherEvents = cleaned.filter(e => e !== navEvent);

    if (navEvent) {
        cleaned = [navEvent, ...otherEvents];
    }

    // ===== 2. MERGE CONSECUTIVE INPUTS =====
    const merged = [];
    for (const ev of cleaned) {
        const last = merged[merged.length - 1];

        if (ev.type === "input" &&
            last &&
            last.type === "input" &&
            ev.data?.selector === last.data?.selector) {
            last.data.value = ev.data.value;
            last.t = ev.t;
            continue;
        }

        merged.push(ev);
    }

    // ===== 3. REMOVE REDUNDANT ACTIONS =====
    const optimized = [];
    for (let i = 0; i < merged.length; i++) {
        const current = merged[i];
        const next = merged[i + 1];
        const prev = optimized[optimized.length - 1];

        // Skip click on form field if next is input
        if (current.type === "click" &&
            next &&
            next.type === "input" &&
            current.data?.selector === next.data?.selector) {
            continue;
        }

        // Skip duplicate clicks within 2 seconds
        if (current.type === "click" &&
            prev &&
            prev.type === "click" &&
            current.data?.selector === prev.data?.selector &&
            current.data?.text === prev.data?.text) {
            const timeDiff = (current.t || 0) - (prev.t || 0);
            if (timeDiff < 2000) continue;
        }

        // Skip form_submit if preceded by submit button click
        if (current.type === "form_submit" && prev && prev.type === "click") {
            const prevText = (prev.data?.text || "").toLowerCase();
            if (prevText.includes("login") ||
                prevText.includes("submit") ||
                prevText.includes("sign in") ||
                prevText.includes("sign up") ||
                prevText.includes("continue")) {
                continue;
            }
        }

        // Skip hovers if option disabled
        if (current.type === "hover" && !config.includeHovers) {
            continue;
        }

        // Skip scrolls if option disabled
        if (current.type === "scroll" && !config.includeScrolls) {
            continue;
        }

        optimized.push(current);
    }

    // ===== 4. BUILD SELECTORS =====
    const getSelector = (ev) => {
        const s = ev.data?.selector || "";
        const txt = ev.data?.text?.trim();

        if (txt && txt.length < 50 && txt.length > 0) {
            return `cy.contains('${txt.replace(/'/g, "\\'")}')`;
        }

        if (/^#[\w-]+$/.test(s)) return `cy.get('${s}')`;
        if (s.includes("[data-testid")) return `cy.get('${s}')`;
        if (s.includes("[aria-label")) return `cy.get('${s}')`;

        const parts = s.split(' > ');
        if (parts.length > 2) {
            return `cy.get('${parts.slice(-2).join(' > ')}')`;
        }

        return `cy.get('${s}')`;
    };

    // ===== 5. DETECT TEST TYPE =====
    const textDump = optimized.map(e => e.data?.text || "").join(" ").toLowerCase();
    const testName = meta.testName || detectTestType(textDump, optimized);
    const testDesc = meta.testDescription || "should perform recorded actions successfully";

    // ===== 6. GENERATE CODE =====
    const lines = [];

    lines.push("/**");
    lines.push(` * Test Name: ${testName}`);
    lines.push(` * Description: ${testDesc}`);
    lines.push(` * Framework: ${fw}`);
    lines.push(` * Events Recorded: ${optimized.length}`);
    lines.push(` * Generated: ${new Date().toLocaleString()}`);
    lines.push(" */\n");

    lines.push(`describe('${testName}', () => {`);
    lines.push(`  it('${testDesc}', () => {`);

    let step = 1;
    let hasAssertion = false;

    for (const ev of optimized) {
        const s = ev.data?.selector || "";
        const v = (ev.data?.value || "").replace(/'/g, "\\'");
        const url = ev.data?.href || "";
        const txt = (ev.data?.text || "").trim();

        switch (ev.type) {
            case "navigation":
                if (url && !url.includes("cloudflare")) {
                    lines.push(`\n    // Step ${step++}: Navigate to the application`);
                    lines.push(`    cy.visit('${url}');`);
                }
                break;

            case "input":
                if (v) {
                    const fieldName = ev.data?.label || ev.data?.placeholder || ev.data?.name || s;
                    lines.push(`\n    // Step ${step++}: Enter "${v}" in ${fieldName}`);
                    lines.push(`    ${getSelector(ev)}.clear().type('${v}');`);
                }
                break;

            case "select":
                lines.push(`\n    // Step ${step++}: Select "${ev.data?.text || ev.data?.value}" from dropdown`);
                lines.push(`    ${getSelector(ev)}.select('${ev.data?.value}');`);
                break;

            case "checkbox":
                const checkAction = ev.data?.checked ? 'check' : 'uncheck';
                lines.push(`\n    // Step ${step++}: ${checkAction.charAt(0).toUpperCase() + checkAction.slice(1)} "${ev.data?.label || s}"`);
                lines.push(`    ${getSelector(ev)}.${checkAction}();`);
                break;

            case "radio":
                lines.push(`\n    // Step ${step++}: Select radio button "${ev.data?.label || ev.data?.value}"`);
                lines.push(`    ${getSelector(ev)}.check();`);
                break;

            case "file_upload":
                const fileNames = ev.data?.files?.map(f => f.name).join(', ') || 'file.txt';
                lines.push(`\n    // Step ${step++}: Upload file(s): ${fileNames}`);
                lines.push(`    ${getSelector(ev)}.selectFile('cypress/fixtures/${fileNames}');`);
                break;

            case "drag_drop":
                lines.push(`\n    // Step ${step++}: Drag "${ev.data?.sourceText}" to "${ev.data?.targetText}"`);
                lines.push(`    cy.get('${ev.data?.source}').drag('${ev.data?.target}');`);
                break;

            case "hover":
                if (config.includeHovers) {
                    lines.push(`\n    // Step ${step++}: Hover over "${txt}"`);
                    lines.push(`    ${getSelector(ev)}.trigger('mouseover');`);
                }
                break;

            case "double_click":
                lines.push(`\n    // Step ${step++}: Double-click "${txt}"`);
                lines.push(`    ${getSelector(ev)}.dblclick();`);
                break;

            case "right_click":
                lines.push(`\n    // Step ${step++}: Right-click "${txt}"`);
                lines.push(`    ${getSelector(ev)}.rightclick();`);
                break;

            case "scroll":
                if (config.includeScrolls) {
                    lines.push(`\n    // Step ${step++}: Scroll ${ev.data?.direction || 'down'}`);
                    lines.push(`    cy.scrollTo(0, ${ev.data?.y || 500});`);
                }
                break;

            case "keyboard_shortcut":
                const keys = [];
                if (ev.data?.ctrl) keys.push('ctrl');
                if (ev.data?.meta) keys.push('cmd');
                if (ev.data?.alt) keys.push('alt');
                if (ev.data?.shift) keys.push('shift');
                keys.push(ev.data?.key?.toLowerCase() || 'a');

                lines.push(`\n    // Step ${step++}: Press ${keys.join('+')} shortcut`);
                lines.push(`    cy.get('body').type('{${keys.join('+')}');`);
                break;

            case "click":
                const isSubmit = txt.toLowerCase().includes("login") ||
                    txt.toLowerCase().includes("submit") ||
                    txt.toLowerCase().includes("sign in") ||
                    txt.toLowerCase().includes("continue");

                lines.push(`\n    // Step ${step++}: Click "${txt || s}"`);
                lines.push(`    ${getSelector(ev)}.click();`);

                if (isSubmit && config.includeAssertions) {
                    lines.push(`\n    // Verify successful submission`);
                    lines.push(`    cy.url().should('not.include', 'login');`);
                    hasAssertion = true;
                }
                break;

            case "assertion":
                if (!config.includeAssertions) break;

                const msg = ev.data?.text?.replace(/'/g, "\\'") || "";
                const assertType = ev.data?.type || "";

                if (msg) {
                    lines.push(`\n    // Step ${step++}: Verify ${assertType.replace('_', ' ')}`);
                    lines.push(`    cy.contains('${msg}').should('be.visible');`);
                    hasAssertion = true;
                }
                break;

            case "wait_state":
                lines.push(`\n    // Step ${step++}: Wait for loading to complete`);
                lines.push(`    cy.contains('${ev.data?.text}').should('not.exist');`);
                break;

            case "fetch":
                if (!config.includeNetworkCalls) break;

                const method = ev.data?.method || "GET";
                const apiUrl = ev.data?.url || "";

                if (apiUrl && !apiUrl.includes("analytics")) {
                    const endpoint = apiUrl.split('/').pop() || 'api';
                    lines.push(`\n    // Step ${step++}: Wait for API response`);
                    lines.push(`    cy.intercept('${method}', '*${endpoint}*').as('apiRequest');`);
                    lines.push(`    cy.wait('@apiRequest');`);
                }
                break;
        }
    }

    // Final steps
    lines.push(`\n    // Step ${step++}: Wait for page stability`);
    lines.push(`    cy.wait(500);`);

    if (!hasAssertion && config.includeAssertions) {
        lines.push(`\n    // Step ${step++}: Verify test completion`);
        lines.push(`    cy.url().should('not.include', 'error');`);
    }

    lines.push(`    cy.screenshot('${testName.toLowerCase().replace(/\s+/g, "_")}');`);

    lines.push("  });");
    lines.push("});");

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function detectTestType(textDump, events) {
    if (textDump.includes("login") || textDump.includes("sign in")) {
        return "Login Flow";
    }
    if (textDump.includes("register") || textDump.includes("sign up")) {
        return "Registration Flow";
    }
    if (textDump.includes("checkout") || textDump.includes("payment")) {
        return "Checkout Flow";
    }
    if (events.some(e => e.type === "file_upload")) {
        return "File Upload Flow";
    }
    if (events.some(e => e.type === "drag_drop")) {
        return "Drag & Drop Interaction";
    }
    if (events.some(e => e.type === "select")) {
        return "Form Selection Flow";
    }
    if (events.filter(e => e.type === "navigation").length > 1) {
        return "Multi-Page Navigation";
    }
    return "User Flow";
}

// ===== EXPORT FOR DIFFERENT FRAMEWORKS =====
function generateForFramework(framework, events) {
    // This function can be extended to support Playwright, Selenium, etc.
    switch (framework.toLowerCase()) {
        case 'cypress':
            return generateTestFromEvents('cypress', events);
        case 'playwright':
            return generatePlaywrightTest(events);
        case 'selenium':
            return generateSeleniumTest(events);
        case 'puppeteer':
            return generatePuppeteerTest(events);
        default:
            return generateTestFromEvents('cypress', events);
    }
}

// Placeholder for other frameworks (to be implemented)
function generatePlaywrightTest(events) {
    // Similar structure but with Playwright syntax
    return "// Playwright test generation coming soon...";
}

function generateSeleniumTest(events) {
    // Similar structure but with Selenium syntax
    return "// Selenium test generation coming soon...";
}

function generatePuppeteerTest(events) {
    // Similar structure but with Puppeteer syntax
    return "// Puppeteer test generation coming soon...";
}




// === Message Handlers ===
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    // --- lightweight events (synchronous) ---
    if (req.action === "recordEvent") {
        pushSessionEvent(sender?.tab?.id || req.tabId, req.payload);
        return; // immediate, no async
    }

    if (req.action === "startRecordingSession") {
        console.log("🎬 Manual recording started");
        isRecording = true;
        recordedEvents = [];
        recordedEvents.metadata = req.metadata || {};
        sendResponse({ success: true });
        return true;
    }

    if (req.action === "getRecordingState") {
        sendResponse({ success: true, eventCount: recordedEvents.length, isRecording });
        return true;
    }

    if (req.action === "stopRecordingSession") {
        console.log("🛑 Manual recording stopped, total:", recordedEvents.length);
        isRecording = false;
        sendResponse({ success: true, data: recordedEvents });
        return true;
    }

    // --- heavy async work wrapped in a Promise ---
    if (req.action === "generateAutomatedTest" || req.action === "exportSession") {
        (async () => {
            try {
                if (req.action === "generateAutomatedTest") {
                    console.log("🧠 Generating test code for framework:", req.framework);
                    const code = generateTestFromEvents(req.framework, recordedEvents);
                    const data = await chrome.storage.local.get("savedTests");
                    const existing = data.savedTests || [];
                    const testData = {
                        id: Date.now(),
                        framework: req.framework,
                        createdAt: new Date().toISOString(),
                        eventCount: recordedEvents.length,
                        code,
                        testName: recordedEvents?.metadata?.testName || "Untitled Test",
                        testDescription: recordedEvents?.metadata?.testDescription || ""
                    };
                    existing.push(testData);
                    await chrome.storage.local.set({ savedTests: existing });
                    console.log("✅ Code generation complete, sending back:", req.framework);
                    sendResponse({ success: true, code });
                } else if (req.action === "exportSession") {
                    const tabId = req.tabId || sender?.tab?.id || lastActivePageTab;
                    const data = sessionBuffers.get(tabId) || [];
                    sendResponse({ success: true, data });
                }
            } catch (err) {
                console.error("❌ Background async error:", err);
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true; // keep port alive for async
    }

    // --- unknown ---
    sendResponse({ success: false, error: "Unknown action" });
    return true;
});