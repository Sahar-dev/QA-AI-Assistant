// background/smartApiAssertions.js - IMPROVED VERSION

export function generateApiAssertions(events = []) {
    const assertions = [];
    const seenEndpoints = new Map(); // Track unique endpoints

    for (const ev of events) {
        if (ev.type !== "fetch") continue;

        const { method, url, status, timeMs } = ev.data || {};
        if (!url) continue;

        // Extract clean endpoint path
        let endpoint = "";
        try {
            const urlObj = new URL(url);
            endpoint = urlObj.pathname;

            // Remove IDs from path for better grouping
            // e.g., /api/users/123 becomes /api/users/{id}
            endpoint = endpoint.replace(/\/\d+/g, '/{id}');
        } catch {
            endpoint = url;
        }

        const key = `${method}:${endpoint}`;

        // Only add intercept ONCE per unique endpoint
        if (!seenEndpoints.has(key)) {
            // Create readable alias
            const alias = `${method.toLowerCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, "_")}`;

            assertions.push(`cy.intercept('${method}', '**${endpoint}').as('${alias}');`);

            seenEndpoints.set(key, {
                alias,
                statuses: [status],
                times: [timeMs]
            });
        } else {
            // Track additional calls to same endpoint
            const data = seenEndpoints.get(key);
            data.statuses.push(status);
            data.times.push(timeMs);
        }
    }

    // Generate assertions for each endpoint
    for (const [key, data] of seenEndpoints.entries()) {
        const { alias, statuses, times } = data;

        // Most common status code for this endpoint
        const mostCommonStatus = statuses.sort((a, b) =>
            statuses.filter(s => s === a).length - statuses.filter(s => s === b).length
        ).pop();

        // Assert status code
        if (mostCommonStatus) {
            assertions.push(`cy.wait('@${alias}').its('response.statusCode').should('eq', ${mostCommonStatus});`);
        }

        // Performance assertion (use max time + 50% buffer)
        if (times.length > 0) {
            const maxTime = Math.max(...times);
            const threshold = Math.max(maxTime * 1.5, 2000); // At least 2s
            assertions.push(`cy.wait('@${alias}').its('response.duration').should('be.lessThan', ${Math.round(threshold)});`);
        }

        // Assert response exists
        assertions.push(`cy.wait('@${alias}').should('have.property', 'response');`);
    }

    return assertions;
}