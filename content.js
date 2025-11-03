// content.js - Detect what page you're on
function detectPageType() {
    const url = window.location.href;
    if (url.includes('jira')) return 'JIRA_TICKET';
    if (url.includes('github.com') && url.includes('issues')) return 'GITHUB_ISSUE';
    if (url.includes('swagger') || url.includes('api-docs')) return 'API_DOCS';
    if (url.includes('figma.com')) return 'DESIGN_MOCKUP';
    return 'GENERIC';
}

function autoExtractContent() {
    const pageType = detectPageType();
    switch (pageType) {
        case 'JIRA_TICKET':
            return extractJiraTicketData();
        case 'GITHUB_ISSUE':
            return extractGitHubIssue();
        case 'API_DOCS':
            return extractAPISpec();
    }
}

function extractJiraTicketData() {
    return {
        title: document.querySelector('[data-testid="issue.views.field.summary"]')?.textContent,
        description: document.querySelector('[data-testid="issue.views.field.rich-text.description"]')?.textContent,
        acceptanceCriteria: document.querySelector('.ak-renderer-document')?.textContent,
        labels: Array.from(document.querySelectorAll('.css-1nd3s5y')).map(el => el.textContent)
    };
}