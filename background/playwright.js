// background/playwright.js
export function generatePlaywrightTest(events = [], options = {}) {
    if (!events.length) return "// No recorded events found.";

    const config = {
        includeAssertions: options.includeAssertions ?? true,
        includeHovers: options.includeHovers ?? false,
        includeScrolls: options.includeScrolls ?? false,
        ...options,
    };

    const optimized = cleanEvents(events, config);
    const testName = (events.metadata?.testName || "Recorded Test").trim();
    const testDesc =
        events.metadata?.testDescription ||
        "should perform recorded actions successfully";

    const lines = [];
    lines.push("/**");
    lines.push(` * Test Name: ${testName}`);
    lines.push(` * Description: ${testDesc}`);
    lines.push(` * Framework: playwright`);
    lines.push(` * Events Recorded: ${optimized.length}`);
    lines.push(` * Generated: ${new Date().toLocaleString()}`);
    lines.push(" */\n");
    lines.push(`import { test, expect } from '@playwright/test';`);
    lines.push("");
    lines.push(`test('${testName}', async ({ page }) => {`);

    let step = 1;

    for (const ev of optimized) {
        const s = ev.data?.selector || "";
        const v = (ev.data?.value || "").replace(/'/g, "\\'");
        const url = ev.data?.href || "";
        const txt = (ev.data?.text || "").trim();

        switch (ev.type) {
            // ---------------- Navigation ----------------
            case "navigation": {
                if (!url || url.includes("cloudflare")) break;
                const prevNav = optimized
                    .slice(0, optimized.indexOf(ev))
                    .reverse()
                    .find(e => e.type === "navigation");

                if (prevNav && prevNav.data?.href === url) {
                    lines.push(
                        `\n  // Step ${step++}: Page reloaded (possible redirect or failed login)`
                    );
                    const safePath = new URL(url).pathname.replace(/^\/+|\/+$/g, ""); // remove leading/trailing slashes
                    lines.push(`  await expect(page).toHaveURL(new RegExp("/${safePath}/"));`);

                    // 🔍 search for assertion text near this time window
                    const err = optimized.find(
                        e =>
                            e.type === "assertion" &&
                            e.t >= ev.t &&
                            e.t <= ev.t + 3000 &&
                            /(invalid|error|failed|incorrect)/i.test(e.data?.text || "")
                    );
                    if (err) {
                        const msg = err.data.text.replace(/'/g, "\\'");
                        lines.push(`  await expect(page.getByText('${msg}')).toBeVisible();`);
                    }
                } else {
                    lines.push(
                        `\n  // Step ${step++}: Navigate to the application`
                    );
                    lines.push(`  await page.goto('${url}');`);
                }
                break;
            }

            // ---------------- Input ----------------
            case "input":
                if (v) {
                    const fieldName =
                        ev.data?.label ||
                        ev.data?.placeholder ||
                        ev.data?.name ||
                        s;
                    lines.push(
                        `\n  // Step ${step++}: Enter "${v}" in ${fieldName}`
                    );
                    lines.push(
                        `  await page.locator('${s}').fill('${v}');`
                    );
                }
                break;

            // ---------------- Click ----------------
            case "click": {
                const isSubmit =
                    txt.toLowerCase().includes("login") ||
                    txt.toLowerCase().includes("submit") ||
                    txt.toLowerCase().includes("sign in") ||
                    txt.toLowerCase().includes("continue");

                lines.push(
                    `\n  // Step ${step++}: Click "${txt || s}"`
                );
                lines.push(`  await page.locator('${s}').click();`);

                if (isSubmit && config.includeAssertions) {
                    const nextNav = optimized.find(
                        e => e.t > ev.t && e.type === "navigation"
                    );
                    if (nextNav && nextNav.data?.href.includes("/user/login")) {
                        // Failed login
                        lines.push(`\n  // Verify failed login`);
                        lines.push(
                            `  await expect(page).toHaveURL(/\\/user\\/login/);`
                        );
                        lines.push(
                            `  await expect(page.getByText(/invalid|error|incorrect/i)).toBeVisible();`
                        );
                    } else {
                        // Success path
                        lines.push(`\n  // Verify successful submission`);
                        lines.push(
                            `  await expect(page).not.toHaveURL(/login/);`
                        );
                    }
                }
                break;
            }

            // ---------------- Hover ----------------
            case "hover":
                if (config.includeHovers) {
                    lines.push(`\n  // Step ${step++}: Hover over "${txt}"`);
                    lines.push(
                        `  await page.locator('${s}').hover();`
                    );
                }
                break;

            // ---------------- Assertion ----------------
            case "assertion":
                if (!config.includeAssertions) break;
                const msg = ev.data?.text?.replace(/'/g, "\\'") || "";
                if (msg) {
                    lines.push(
                        `\n  // Step ${step++}: Verify ${ev.data?.type || ""}`
                    );
                    lines.push(
                        `  await expect(page.getByText('${msg}')).toBeVisible();`
                    );
                }
                break;

            default:
                break;
        }
    }

    lines.push(`\n  // Step ${step++}: Wait for page stability`);
    lines.push(`  await page.waitForTimeout(500);`);
    lines.push(`  await page.screenshot({ path: '${testName.toLowerCase().replace(/\s+/g, "_")}.png' });`);
    lines.push("});");
    return lines.join("\n");
}

// ----- utility: quick event filter (same as Cypress clean) -----
function cleanEvents(events, config) {
    return events.filter(e => {
        if (!e || !e.type) return false;
        if (["keydown", "keyup", "mouse_move"].includes(e.type)) return false;
        if (
            e.type === "hover" &&
            !config.includeHovers
        )
            return false;
        if (
            e.type === "scroll" &&
            !config.includeScrolls
        )
            return false;
        if (
            e.type === "click" &&
            /^(html|body)/i.test(e.data?.selector || "")
        )
            return false;
        return true;
    });
}
