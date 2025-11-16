
export function generateSmartAssertions(events = []) {
    const assertions = [];
    const seen = new Set(); // prevent duplicates

    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const next = events[i + 1];

        if (!ev || !ev.type) continue;

        // 1. URL ASSERTIONS (Navigation)
        if (ev.type === "navigation" && ev.data?.href) {
            try {
                const url = new URL(ev.data.href);
                const a = `cy.url().should('include', '${url.pathname}');`;

                if (!seen.has(a)) {
                    assertions.push(a);
                    seen.add(a);
                }
            } catch (_) { }
        }

        // 2. INPUT ASSERTIONS
        if (ev.type === "input" && ev.data?.value && ev.data.selector) {
            const value = ev.data.value.replace(/'/g, "\\'");
            const selector = ev.data.selector.replace(/'/g, "\\'");
            const a = `cy.get('${selector}').should('have.value', '${value}');`;

            if (!seen.has(a)) {
                assertions.push(a);
                seen.add(a);
            }
        }

        // 3. CLICK ASSERTIONS (Visibility of clicked element)
        if (ev.type === "click" && ev.data?.text) {
            const txt = ev.data.text.replace(/'/g, "\\'");
            if (txt.length > 1 && txt.length < 100) {
                const a = `cy.contains('${txt}').should('be.visible');`;
                if (!seen.has(a)) {
                    assertions.push(a);
                    seen.add(a);
                }
            }
        }

        // 4. ASSERTION EVENTS FROM RECORDER
        if (ev.type === "assertion" && ev.data?.text) {
            const msg = ev.data.text.replace(/'/g, "\\'");
            const a = `cy.contains('${msg}').should('be.visible');`;

            if (!seen.has(a)) {
                assertions.push(a);
                seen.add(a);
            }
        }

        // 5. ERROR MESSAGES (common auto-detect)
        if (ev.data?.text && /(invalid|error|failed|incorrect)/i.test(ev.data.text)) {
            const msg = ev.data.text.replace(/'/g, "\\'");
            const a = `cy.contains('${msg}').should('be.visible');`;

            if (!seen.has(a)) {
                assertions.push(a);
                seen.add(a);
            }
        }
    }

    return assertions;
}