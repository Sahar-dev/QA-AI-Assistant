import { generatePlaywrightTest } from './playwright.js'; // new file coming next
import { generateSmartAssertions } from "./assertions.js";
import { generateApiAssertions } from "./smartApiAssertions.js";

export function generateTestFromEvents(framework, events = [], options = {}) {
    if (!events.length) return "// No recorded events found.";

    // 🔍 DEBUG: Log all event types
    console.log("📊 All captured events:", events);
    console.log("📊 Event types:", events.map(e => e.type));
    console.log("📊 Fetch events:", events.filter(e => e.type === "fetch"));

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
    // 🔍 DEBUG: Log config
    console.log("⚙️ Config:", config);
    // ===== 1. CLEAN & SORT =====
    let cleaned = events.filter(e => {
        if (!e || !e.type) return false;

        // Don't filter out these important events
        if (['keydown', 'keyup', 'mouse_move'].includes(e.type)) return false;

        const selector = e.data?.selector || "";
        if (selector.startsWith("> body") || selector === "body") return false;

        // ✅ ALWAYS keep fetch events (they don't have selectors)
        if (e.type === "fetch") return true;

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

        // 🔥 CRITICAL: ALWAYS keep fetch events - they never get filtered
        if (current.type === "fetch" || current.type === "fetch_error") {
            console.log("✅ Preserving fetch event:", current.data?.url);
            optimized.push(current);
            continue;
        }

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

        // Skip background clicks on <html> or <body>
        if (current.type === "click" &&
            /^(html|body)/i.test(current.data?.selector || "")) {
            continue;
        }

        // Skip duplicate hovers on the same selector within 2 s
        if (current.type === "hover" &&
            prev &&
            prev.type === "hover" &&
            prev.data?.selector === current.data?.selector &&
            (current.t - prev.t) < 2000) {
            continue;
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
    console.log("✨ After optimization:", optimized.length, "events");
    console.log("✨ Fetch events after optimization:", optimized.filter(e => e.type === "fetch"));
    console.log("✨ All optimized event types:", optimized.map(e => e.type));
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
                if (!url || url.includes("cloudflare")) break;

                const prevNav = optimized
                    .slice(0, optimized.indexOf(ev))
                    .reverse()
                    .find(e => e.type === "navigation");

                if (prevNav && prevNav.data?.href === url) {
                    // same page reloaded — likely redirect or failed login
                    lines.push(`\n    // Step ${step++}: Page reloaded (possible redirect or failed login)`);
                    lines.push(`    cy.url().should('include', '${new URL(url).pathname}');`);

                    // 🔍 look ahead for error/assertion events within 3 s
                    const errorEvt = optimized.find(
                        e =>
                            e.type === "assertion" &&
                            e.t >= ev.t &&
                            e.t <= ev.t + 3000 &&
                            /(invalid|error|failed|incorrect)/i.test(e.data?.text || "")
                    );
                    if (errorEvt) {
                        const msg = errorEvt.data.text.replace(/'/g, "\\'");
                        lines.push(`    cy.contains('${msg}').should('be.visible');`);
                    }
                } else {
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
                const isSubmit =
                    txt.toLowerCase().includes("login") ||
                    txt.toLowerCase().includes("submit") ||
                    txt.toLowerCase().includes("sign in") ||
                    txt.toLowerCase().includes("continue");

                lines.push(`\n    // Step ${step++}: Click "${txt || s}"`);
                lines.push(`    ${getSelector(ev)}.click();`);

                if (isSubmit && config.includeAssertions) {
                    const nextNav = optimized.find(e => e.t > ev.t && e.type === "navigation");
                    if (nextNav && nextNav.data?.href.includes("/user/login")) {
                        // probably failed login
                        lines.push(`\n    // Verify failed login`);
                        lines.push(`    cy.url().should('include', '/user/login');`);
                        lines.push(`    cy.contains(/invalid|error|incorrect/i).should('be.visible');`);
                    } else {
                        // success path
                        lines.push(`\n    // Verify successful submission`);
                        lines.push(`    cy.url().should('not.include', 'login');`);
                    }
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
    // ----- SMART ASSERTIONS (NEW FEATURE) -----
    if (config.includeAssertions) {
        const smartAsserts = generateSmartAssertions(optimized);

        if (smartAsserts.length) {
            lines.push(`\n    // ----- Smart Assertions Generated Automatically -----`);
            for (const a of smartAsserts) {
                lines.push(`    ${a}`); // must include semicolon at end
            }
        }
    }
    if (config.includeNetworkCalls) {
        const apiAsserts = generateApiAssertions(optimized);

        if (apiAsserts.length) {
            lines.push(`\n    // ----- Smart API Assertions Generated Automatically -----`);
            for (const a of apiAsserts) {
                lines.push(`    ${a}`);
            }
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
export function generateForFramework(framework, events, options = {}) {
    const fw = (framework || '').toLowerCase();
    switch (fw) {
        case 'playwright':
            return generatePlaywrightTest(events, options);
        case 'cypress':
            return generateTestFromEvents('cypress', events, options);
        case 'selenium':
            return generateSeleniumTest(events);
        case 'puppeteer':
            return generatePuppeteerTest(events);
        default:
            return generateTestFromEvents('cypress', events, options);
    }
}


function generateSeleniumTest(events) {
    // Similar structure but with Selenium syntax
    return "// Selenium test generation coming soon...";
}

function generatePuppeteerTest(events) {
    // Similar structure but with Puppeteer syntax
    return "// Puppeteer test generation coming soon...";
}



