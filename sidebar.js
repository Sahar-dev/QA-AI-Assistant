// sidebar.js - Clean, stable version (no duplicate imports / intervals)
console.log('✅ QA Copilot loaded');

window.addEventListener('DOMContentLoaded', async () => {
    console.log('⚙️ Initializing QA Copilot UI...');
    await initApp();
});

async function initApp() {
    setupNavigation();
    setupTestGeneration?.();
    setupAnalysis?.();
    setupTestData?.();
    setupExport?.();
    setupSettings?.();
    setupTimeline();
    loadSettings?.();
}

// ===== TIMELINE TAB =====
function setupTimeline() {
    const container = document.getElementById('timeline-container');

    // Lazy import (so module loads only when needed)
    async function getTimelineModule() {
        if (!window._timelineModule) {
            const url = chrome.runtime.getURL('recording/timeline-view.js');
            window._timelineModule = await import(url);
        }
        return window._timelineModule;
    }

    // Manual refresh button
    document.getElementById('refresh-timeline')?.addEventListener('click', async () => {
        const mod = await getTimelineModule();
        mod.renderTimeline(container);
    });

    // Auto-refresh every 10 seconds when timeline is active
    setInterval(async () => {
        const tabPane = document.getElementById('timeline');
        if (tabPane?.classList.contains('active')) {
            const mod = await getTimelineModule();
            mod.renderTimeline(container);
        }
    }, 10000);

    // 🐛 Report Bug button
    document.getElementById('report-bug-btn')?.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const res = await chrome.runtime.sendMessage({ action: 'exportSession', tabId: tab.id });
        const events = res?.data || [];

        const bugData = {
            page: tab.url,
            capturedAt: new Date().toISOString(),
            recentErrors: events.filter(e => e.type.includes('error')),
            recentNetwork: events.filter(e => ['fetch', 'xhr', 'fetch_error'].includes(e.type)),
            lastActions: events.slice(-10)
        };

        const md = `### 🐛 Bug Report
**Page:** ${bugData.page}  
**Captured:** ${bugData.capturedAt}

#### 🔴 Recent Errors
\`\`\`json
${JSON.stringify(bugData.recentErrors, null, 2)}
\`\`\`

#### 🌐 Network Requests
\`\`\`json
${JSON.stringify(bugData.recentNetwork, null, 2)}
\`\`\`

#### 🪄 Last User Actions
\`\`\`json
${JSON.stringify(bugData.lastActions, null, 2)}
\`\`\``;

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bug-report-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);

        showToast?.('Bug report exported', 'success');
    });
}

// ===== NAVIGATION =====
function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.tab-pane');

    function switchTab(tabId) {
        tabs.forEach(t => t.classList.remove('active'));
        navBtns.forEach(n => n.classList.remove('active'));

        document.getElementById(tabId)?.classList.add('active');
        document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');

        const titles = {
            'test-cases': 'Test Case Generator',
            'analyze': 'Page Analyzer',
            'test-data': 'Test Data Generator',
            'accessibility': 'Accessibility Audit',
            'export': 'Export Tests',
            'timeline': 'Session Timeline',
            'settings': 'Settings'
        };
        document.getElementById('header-title').textContent = titles[tabId] || 'QA Copilot';

        // Lazy-load and render timeline automatically when opened
        if (tabId === 'timeline') {
            const url = chrome.runtime.getURL('recording/timeline-view.js');
            import(url).then(mod => {
                mod.renderTimeline(document.getElementById('timeline-container'));
            });
        }
    }

    // Restore last active tab
    chrome.storage.local.get('activeTab', (data) => {
        switchTab(data.activeTab || 'test-cases');
    });

    // Click listeners
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
            chrome.storage.local.set({ activeTab: tabId });
        });
    });
}

// ===== ANALYSIS =====
function setupAnalysis() {
    const actions = ['analyze-structure', 'analyze-forms', 'analyze-links', 'analyze-full'];

    actions.forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => handleAnalysis(id));
    });

    document.getElementById('copy-analysis-btn')?.addEventListener('click', () => {
        copyToClipboard('analyze-output');
    });
}

async function handleAnalysis(type) {
    const output = document.getElementById('analyze-output');
    const card = document.getElementById('analyze-results');

    output.innerHTML = '<div class="loading"><div class="spinner"></div> Analyzing...</div>';
    card.style.display = 'block';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const extraction = await chrome.runtime.sendMessage({
            action: 'extractPageContent',
            tabId: tab.id
        });

        if (!extraction?.success) {
            output.textContent = 'Failed to extract page content';
            return;
        }

        const data = extraction.data?.data || {};
        let analysis = '';

        switch (type) {
            case 'analyze-structure':
                analysis = analyzeStructure(data);
                break;
            case 'analyze-forms':
                analysis = analyzeForms(data);
                break;
            case 'analyze-links':
                analysis = analyzeLinks(data);
                break;
            case 'analyze-full':
                analysis = analyzeStructure(data) + '\n\n' + analyzeForms(data) + '\n\n' + analyzeLinks(data);
                break;
        }

        output.textContent = analysis;
        showToast('Analysis complete!', 'success');
    } catch (error) {
        output.textContent = 'Error: ' + error.message;
        showToast('Analysis failed', 'error');
    }
}

function analyzeStructure(data) {
    return `📊 PAGE STRUCTURE ANALYSIS

Page Title: ${data.title || 'N/A'}
URL: ${data.url || 'N/A'}

Headings Found: ${data.headings?.length || 0}
${data.headings?.map((h, i) => `${i + 1}. ${h}`).join('\n') || 'None'}

✅ Recommended Tests:
1. Verify page loads with correct title
2. Check all headings are properly hierarchical
3. Validate URL structure and routing`;
}

function analyzeForms(data) {
    const inputs = data.inputs || [];
    return `📝 FORM ANALYSIS

Total Form Elements: ${inputs.length}

Fields Detected:
${inputs.map((input, i) => `${i + 1}. ${input.name || 'Unnamed'} (${input.type})${input.required ? ' *Required' : ''}`).join('\n') || 'No forms found'}

✅ Recommended Tests:
1. Validate all required field validations
2. Test boundary values for each input
3. Verify error messages display correctly
4. Test form submission with valid/invalid data`;
}

function analyzeLinks(data) {
    const links = data.links || [];
    return `🔗 NAVIGATION ANALYSIS

Total Links: ${links.length}

Links Found:
${links.map((link, i) => `${i + 1}. ${link.text} → ${link.href}`).join('\n') || 'No links found'}

✅ Recommended Tests:
1. Verify all links are clickable
2. Check no broken links (404s)
3. Test deep linking
4. Validate external links open in new tabs`;
}

// ===== TEST DATA =====
function setupTestData() {
    document.getElementById('generate-data-btn')?.addEventListener('click', handleGenerateData);
    document.getElementById('copy-data-btn')?.addEventListener('click', () => {
        copyToClipboard('data-output');
    });
}

function handleGenerateData() {
    const schemaText = document.getElementById('data-schema').value.trim();
    const count = parseInt(document.getElementById('record-count').value);
    const format = document.getElementById('data-format').value;
    const output = document.getElementById('data-output');

    if (!schemaText) {
        showToast('Please enter a schema', 'error');
        return;
    }

    try {
        const schema = JSON.parse(schemaText);
        const data = generateMockData(schema, count, format);
        output.textContent = JSON.stringify(data, null, 2);
        showToast('Test data generated!', 'success');
    } catch (error) {
        output.innerHTML = `<div style="color: #ef4444;">❌ Invalid schema: ${error.message}</div>`;
        showToast('Invalid schema', 'error');
    }
}

function generateMockData(schema, count, format) {
    const results = [];

    for (let i = 0; i < count; i++) {
        const record = {};

        for (const [key, type] of Object.entries(schema)) {
            record[key] = generateValue(type, i, format);
        }

        results.push(record);
    }

    return results;
}

function generateValue(type, index, format) {
    const invalid = format === 'Invalid Data';
    const edge = format === 'Edge Cases';

    switch (type.toLowerCase()) {
        case 'string':
            if (invalid) return index % 2 === 0 ? null : '';
            if (edge) return 'A'.repeat(1000);
            return `Sample ${index + 1}`;

        case 'email':
            if (invalid) return 'invalid.email';
            if (edge) return `test${'x'.repeat(50)}@example.com`;
            return `user${index + 1}@example.com`;

        case 'number':
        case 'age':
            if (invalid) return 'not-a-number';
            if (edge) return index % 2 === 0 ? -999 : 999;
            return Math.floor(Math.random() * 100);

        case 'boolean':
            if (invalid) return 'maybe';
            return Math.random() > 0.5;

        case 'phone':
            if (invalid) return '123';
            if (edge) return '+1' + '9'.repeat(20);
            return `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`;

        case 'date':
            if (invalid) return '2024-13-45';
            if (edge) return '1900-01-01';
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 365));
            return date.toISOString().split('T')[0];

        default:
            return `value_${index + 1}`;
    }
}

// ===== EXPORT =====
function setupExport() {
    const exportBtns = document.querySelectorAll('.export-btn');
    const downloadBtn = document.getElementById('download-btn');

    exportBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            exportBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            showExportPreview(btn.dataset.format);
        });
    });

    downloadBtn.addEventListener('click', handleDownload);
}

function showExportPreview(format) {
    const preview = document.getElementById('export-preview');
    const testCases = document.getElementById('test-output').textContent;

    const templates = {
        cypress: `describe('Test Suite', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should verify basic functionality', () => {
    cy.get('[data-testid="element"]').should('be.visible');
    cy.get('button').click();
    cy.get('.result').should('contain', 'success');
  });
});`,

        jest: `import { render, screen } from '@testing-library/react';
import Component from './Component';

describe('Component Tests', () => {
  test('renders correctly', () => {
    render(<Component />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});`,

        postman: JSON.stringify({
            info: { name: 'API Tests', description: 'Generated tests' },
            item: [{ name: 'GET Test', request: { method: 'GET', url: 'https://api.example.com/test' } }]
        }, null, 2),

        playwright: `import { test, expect } from '@playwright/test';

test('basic test', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});`,

        testrail: `Case ID,Title,Priority,Steps,Expected
TC-001,Basic Test,High,"1. Open app\n2. Click button","Success message"`
    };

    preview.textContent = templates[format] || testCases || 'No tests generated yet';
    preview.dataset.format = format;
}

function handleDownload() {
    const preview = document.getElementById('export-preview');
    const content = preview.textContent;
    const format = preview.dataset.format || 'txt';

    const extensions = {
        cypress: 'cy.js',
        jest: 'test.js',
        postman: 'json',
        playwright: 'spec.js',
        testrail: 'csv',
        html: 'html'
    };

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tests.${extensions[format] || 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Downloaded!', 'success');
}

// ===== SETTINGS =====
function setupSettings() {
    document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);

    // Setup toggles
    const toggles = ['toggle-jira', 'toggle-github'];
    toggles.forEach(id => {
        document.getElementById(id)?.addEventListener('click', function () {
            this.classList.toggle('active');
        });
    });
}

async function loadSettings() {
    try {
        const settings = await chrome.storage.sync.get(['apiKey', 'aiProvider']);

        if (settings.apiKey) {
            document.getElementById('api-key').value = settings.apiKey;
        }
        if (settings.aiProvider) {
            document.getElementById('ai-provider').value = settings.aiProvider;
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings() {
    const apiKey = document.getElementById('api-key').value;
    const aiProvider = document.getElementById('ai-provider').value;

    try {
        await chrome.storage.sync.set({ apiKey, aiProvider });
        showToast('Settings saved!', 'success');
    } catch (error) {
        showToast('Failed to save settings', 'error');
    }
}

// ===== UTILITIES =====
function copyToClipboard(elementId) {
    const text = document.getElementById(elementId)?.textContent || '';

    if (!text || text.includes('will appear here')) {
        showToast('Nothing to copy', 'error');
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => showToast('Copied to clipboard!', 'success'))
        .catch(() => showToast('Failed to copy', 'error'));
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div>${type === 'success' ? '✅' : '❌'}</div>
        <div>${message}</div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add fade out animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        to { opacity: 0; transform: translateX(400px); }
    }
`;
document.head.appendChild(style);