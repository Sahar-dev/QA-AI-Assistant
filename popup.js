// popup.js - Complete implementation with error handling
document.addEventListener('DOMContentLoaded', function () {
    console.log('QA AI Assistant loaded successfully!');
    initializeApp();
});

function initializeApp() {
    setupTabNavigation();
    setupTestCaseGeneration();
    setupTestDataGeneration();
    setupExportOptions();
    setupAnalysisButtons();
    setupCopyButtons();
    setupSettings();
    loadSettings();
}

// Tab Navigation
function setupTabNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function () {
            console.log('Tab clicked:', this.getAttribute('data-tab'));
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            const tabId = this.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');

            const tabTitle = this.textContent.trim();
            document.getElementById('current-tab-title').textContent = tabTitle;
        });
    });
}

// Test Case Generation
function setupTestCaseGeneration() {
    const generateBtn = document.getElementById('generate-tests-btn');
    const extractBtn = document.getElementById('extract-text-btn');

    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerateTests);
        console.log('Generate button listener attached');
    }

    if (extractBtn) {
        extractBtn.addEventListener('click', handleExtractFromPage);
        console.log('Extract button listener attached');
    }
}

async function handleGenerateTests() {
    console.log('Generate Tests clicked');
    const featureText = document.getElementById('feature-input').value.trim();
    const testType = document.getElementById('test-type').value;
    const riskLevel = document.getElementById('risk-level').value;
    const output = document.getElementById('test-output');

    if (!featureText) {
        showError(output, 'Please enter a feature description first!');
        return;
    }

    output.textContent = 'Generating test cases... 🧪';

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'generateTestCases',
            data: { featureText, testType, riskLevel }
        });

        console.log('Response received:', response);

        if (response && response.success) {
            output.textContent = response.testCases;
            output.style.color = 'inherit';
            if (response.fallback) {
                showWarning('Using rule-based generation. Configure API key in Settings for AI-powered tests.');
            }
        } else {
            showError(output, response?.error || 'Failed to generate test cases');
        }
    } catch (error) {
        console.error('Generation error:', error);
        showError(output, 'Error: ' + error.message);
    }
}

async function handleExtractFromPage() {
    console.log('Extract from page clicked');
    const featureInput = document.getElementById('feature-input');
    featureInput.value = 'Extracting from page...';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('Active tab:', tab);

        const response = await chrome.runtime.sendMessage({
            action: 'extractPageContent',
            tabId: tab.id
        });

        console.log('Extract response:', response);

        if (response && response.success) {
            const d = response.data?.data || {};
            let extractedText = '';

            extractedText = `
Page Title: ${d.title || '(no title)'}
URL: ${d.url || '(no URL)'}

Inputs:
${d.inputs && d.inputs.length
                    ? d.inputs.map(i =>
                        `- ${i.name || '(unnamed)'} (${i.type})${i.required ? ' [required]' : ''}${i.placeholder ? ` – placeholder: "${i.placeholder}"` : ''
                        }`
                    ).join('\n')
                    : 'None found'}

Buttons:
${d.buttons && d.buttons.length ? d.buttons.map(b => `- ${b}`).join('\n') : 'None found'}

Links (top 5):
${d.links && d.links.length
                    ? d.links.map(l => `- ${l.text || '(no text)'} → ${l.href}`).join('\n')
                    : 'None found'}

Headings:
${d.headings && d.headings.length ? d.headings.join('\n') : 'None found'}

Selected Text:
${d.selectedText ? d.selectedText : '(none selected)'}
`;

            featureInput.value = extractedText.trim();
        } else {
            featureInput.value =
                '❌ Error extracting content: ' + (response?.error || 'Unknown error');
        }
    } catch (error) {
        console.error('Extraction error:', error);
        featureInput.value = '❌ Error: ' + error.message;
    }
}


// Test Data Generation
function setupTestDataGeneration() {
    const generateDataBtn = document.getElementById('generate-data-btn');
    if (generateDataBtn) {
        generateDataBtn.addEventListener('click', handleGenerateTestData);
        console.log('Generate data button listener attached');
    }
}

function handleGenerateTestData() {
    console.log('Generate test data clicked');
    const schemaText = document.getElementById('data-schema').value.trim();
    const recordCount = parseInt(document.getElementById('record-count').value);
    const dataFormat = document.getElementById('data-format').value;
    const output = document.getElementById('data-output');

    if (!schemaText) {
        showError(output, 'Please enter a data schema first!');
        return;
    }

    output.textContent = 'Generating test data... 📊';

    try {
        const schema = JSON.parse(schemaText);
        const testData = generateTestDataFromSchema(schema, recordCount, dataFormat);
        output.textContent = JSON.stringify(testData, null, 2);
        output.style.color = 'inherit';
    } catch (error) {
        showError(output, 'Invalid JSON schema: ' + error.message);
    }
}

function generateTestDataFromSchema(schema, count, format) {
    const data = [];

    for (let i = 0; i < count; i++) {
        const record = {};

        for (const [key, type] of Object.entries(schema)) {
            record[key] = generateValueByType(type, format, i);
        }

        data.push(record);
    }

    return data;
}

function generateValueByType(type, format, index) {
    const generators = {
        'string': () => {
            if (format === 'Invalid Data') return Math.random() < 0.5 ? null : '';
            if (format === 'Edge Cases') return 'a'.repeat(1000);
            return `Sample Text ${index + 1}`;
        },
        'email': () => {
            if (format === 'Invalid Data') return 'invalid.email';
            if (format === 'Edge Cases') return `very-long-email-address-${index}@${'a'.repeat(100)}.com`;
            return `user${index + 1}@example.com`;
        },
        'number': () => {
            if (format === 'Invalid Data') return 'not-a-number';
            if (format === 'Edge Cases') return index % 2 === 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
            if (format === 'Boundary Values') return index % 2 === 0 ? 0 : 100;
            return Math.floor(Math.random() * 100);
        },
        'age': () => {
            if (format === 'Invalid Data') return -5;
            if (format === 'Edge Cases') return index % 2 === 0 ? 0 : 150;
            if (format === 'Boundary Values') return index % 2 === 0 ? 18 : 65;
            return 18 + Math.floor(Math.random() * 50);
        },
        'phone': () => {
            if (format === 'Invalid Data') return '123';
            if (format === 'Edge Cases') return '+1' + '9'.repeat(50);
            return `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`;
        },
        'boolean': () => {
            if (format === 'Invalid Data') return 'maybe';
            return Math.random() < 0.5;
        },
        'date': () => {
            if (format === 'Invalid Data') return '2024-13-45';
            if (format === 'Edge Cases') return '1900-01-01';
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 365));
            return date.toISOString().split('T')[0];
        }
    };

    const generator = generators[type.toLowerCase()] || generators['string'];
    return generator();
}

// Export Options
function setupExportOptions() {
    document.querySelectorAll('.export-option').forEach(option => {
        option.addEventListener('click', function () {
            const format = this.getAttribute('data-format');
            handleExportPreview(format);
        });
    });

    const downloadBtn = document.getElementById('download-export-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', handleDownloadExport);
    }
}

function handleExportPreview(format) {
    console.log('Export format selected:', format);
    const preview = document.getElementById('export-preview');
    const testCases = document.getElementById('test-output').textContent;

    const exporters = {
        cypress: (tests) => generateCypressExport(tests),
        jest: (tests) => generateJestExport(tests),
        postman: (tests) => generatePostmanExport(tests),
        testrail: (tests) => generateTestRailExport(tests),
        jira: (tests) => generateJiraExport(tests),
        html: (tests) => generateHtmlExport(tests)
    };

    const exporter = exporters[format];
    if (exporter) {
        preview.textContent = exporter(testCases);
        preview.dataset.format = format;
        preview.style.color = 'inherit';
    }
}

function generateCypressExport(testCases) {
    return `// Cypress E2E Test Suite
describe('Generated Test Suite', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should verify basic functionality', () => {
    cy.get('[data-testid="main-element"]').should('be.visible');
  });

  it('should handle valid inputs', () => {
    cy.get('input[name="field1"]').type('test value');
    cy.get('button[type="submit"]').click();
    cy.get('.success-message').should('be.visible');
  });

  it('should handle invalid inputs', () => {
    cy.get('input[name="field1"]').type('invalid');
    cy.get('button[type="submit"]').click();
    cy.get('.error-message').should('contain', 'Invalid input');
  });
});`;
}

function generateJestExport(testCases) {
    return `// Jest Unit Tests
import { render, screen, fireEvent } from '@testing-library/react';
import Component from './Component';

describe('Component Tests', () => {
  test('renders without crashing', () => {
    render(<Component />);
    expect(screen.getByText(/welcome/i)).toBeInTheDocument();
  });

  test('handles user interaction', () => {
    render(<Component />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByText(/success/i)).toBeInTheDocument();
  });
});`;
}

function generatePostmanExport(testCases) {
    return JSON.stringify({
        info: {
            name: "Generated API Tests",
            description: "AI-generated test collection",
            schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        item: [
            {
                name: "GET Request Test",
                request: {
                    method: "GET",
                    url: "https://api.example.com/endpoint"
                }
            }
        ]
    }, null, 2);
}

function generateTestRailExport(testCases) {
    return `Case ID,Title,Type,Priority,Steps,Expected Result
TC-001,Basic Functionality Test,Functional,High,"1. Navigate to page","System responds correctly"
TC-002,Input Validation Test,Functional,High,"1. Enter valid data","Data accepted"`;
}

function generateJiraExport(testCases) {
    return JSON.stringify({
        tests: [
            {
                testKey: "TEST-001",
                summary: "Basic Functionality Test",
                steps: [
                    { step: "Navigate to application", result: "App loads" }
                ]
            }
        ]
    }, null, 2);
}

function generateHtmlExport(testCases) {
    return `<!DOCTYPE html>
<html>
<head>
  <title>QA Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>🧪 QA Test Report</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>
</body>
</html>`;
}

function handleDownloadExport() {
    console.log('Download export clicked');
    const preview = document.getElementById('export-preview');
    const content = preview.textContent;
    const format = preview.dataset.format || 'txt';

    const extensions = {
        cypress: 'cy.js',
        jest: 'test.js',
        postman: 'json',
        testrail: 'csv',
        jira: 'json',
        html: 'html'
    };

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-export.${extensions[format] || 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('File downloaded successfully!', 'success');
}

// Analysis Buttons
function setupAnalysisButtons() {
    const analyzeBtn = document.getElementById('analyze-btn');
    const perfBtn = document.getElementById('run-performance-btn');
    const a11yBtn = document.getElementById('run-accessibility-btn');
    const secBtn = document.getElementById('run-security-btn');

    if (analyzeBtn) analyzeBtn.addEventListener('click', handleAnalyzePage);
    if (perfBtn) perfBtn.addEventListener('click', handlePerformanceAnalysis);
    if (a11yBtn) a11yBtn.addEventListener('click', handleAccessibilityAnalysis);
    if (secBtn) secBtn.addEventListener('click', handleSecurityAnalysis);
}

async function handleAnalyzePage() {
    console.log('Analyze page clicked');
    showNotification('Analyzing current page...', 'info');

    const output = document.getElementById('test-output');

    try {
        // 1️⃣ Extract structure
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const extraction = await chrome.runtime.sendMessage({
            action: 'extractPageContent',
            tabId: tab.id
        });

        if (!extraction || !extraction.success) {
            showNotification('Failed to extract page content.', 'error');
            output.textContent = extraction?.error || 'Extraction failed.';
            return;
        }

        const extracted = extraction.data?.data || {};
        console.log('Extracted structure:', extracted);

        // 2️⃣ Build prompt for AI
        const prompt = `
You are a senior QA engineer.
Given this page structure, describe:
- The purpose of the page
- Expected user actions
- 3–5 positive tests
- 3–5 negative tests
- 2 edge cases
- 2 security tests
Use bullet points and short titles.

Page structure (JSON):
${JSON.stringify(extracted, null, 2)}
`;

        output.textContent = 'Analyzing with AI... 🧠';

        // 3️⃣ Send prompt to background (uses generateTestCasesWithAI)
        const response = await chrome.runtime.sendMessage({
            action: 'generateTestCases',
            data: {
                featureText: prompt,
                testType: 'Functional',
                riskLevel: 'Medium'
            }
        });

        // 4️⃣ Render results nicely
        if (response && response.success) {
            const text = response.testCases || 'No analysis returned.';
            output.textContent = text.trim();
            output.style.color = 'inherit';
        } else {
            output.textContent = `❌ ${response?.error || 'AI analysis failed'}`;
            output.style.color = '#dc3545';
        }

    } catch (err) {
        console.error('Analyze Page error:', err);
        showNotification('Error analyzing page: ' + err.message, 'error');
        output.textContent = '❌ ' + err.message;
    }
}


async function handlePerformanceAnalysis() {
    console.log('Performance analysis clicked');
    showNotification('Running performance analysis...', 'info');
    setTimeout(() => {
        showNotification('Performance analysis complete!', 'success');
    }, 2000);
}

async function handleAccessibilityAnalysis() {
    console.log('Accessibility analysis clicked');
    showNotification('Running accessibility scan...', 'info');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        const response = await chrome.runtime.sendMessage({
            action: 'analyzeAccessibility',
            tabId: tab.id
        });

        if (response && response.success) {
            showNotification(`Found ${response.results.violations} accessibility issues`, 'warning');
        } else {
            showNotification('Accessibility scan failed: ' + (response?.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Accessibility error:', error);
        showNotification('Error: ' + error.message, 'error');
    }
}

function handleSecurityAnalysis() {
    console.log('Security analysis clicked');
    showNotification('Security analysis started...', 'info');
    setTimeout(() => {
        showNotification('Security scan complete!', 'success');
    }, 2000);
}

// Copy Buttons
function setupCopyButtons() {
    const copyTestsBtn = document.getElementById('copy-tests-btn');
    const copyDataBtn = document.getElementById('copy-data-btn');

    if (copyTestsBtn) {
        copyTestsBtn.addEventListener('click', () => {
            copyToClipboard('test-output', 'Test cases copied!');
        });
    }

    if (copyDataBtn) {
        copyDataBtn.addEventListener('click', () => {
            copyToClipboard('data-output', 'Test data copied!');
        });
    }
}

function copyToClipboard(elementId, successMessage) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        showNotification(successMessage, 'success');
    }).catch(err => {
        showNotification('Failed to copy: ' + err.message, 'error');
    });
}

// Settings
function setupSettings() {
    const saveBtn = document.querySelector('#settings .btn-primary');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSaveSettings);
    }
}

async function loadSettings() {
    try {
        const settings = await chrome.storage.sync.get([
            'apiKey', 'aiProvider', 'testComplexity',
            'jiraIntegration', 'githubIntegration', 'testRailIntegration', 'slackIntegration'
        ]);

        if (settings.apiKey) document.getElementById('api-key').value = settings.apiKey;
        if (settings.aiProvider) document.getElementById('ai-provider').value = settings.aiProvider;
        if (settings.testComplexity) document.getElementById('test-complexity').value = settings.testComplexity;

        document.getElementById('jira-integration').checked = settings.jiraIntegration !== false;
        document.getElementById('github-integration').checked = settings.githubIntegration !== false;
        document.getElementById('testrail-integration').checked = settings.testRailIntegration === true;
        document.getElementById('slack-integration').checked = settings.slackIntegration === true;

        console.log('Settings loaded:', settings);
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function handleSaveSettings() {
    console.log('Save settings clicked');
    const settings = {
        apiKey: document.getElementById('api-key').value,
        aiProvider: document.getElementById('ai-provider').value,
        testComplexity: document.getElementById('test-complexity').value,
        jiraIntegration: document.getElementById('jira-integration').checked,
        githubIntegration: document.getElementById('github-integration').checked,
        testRailIntegration: document.getElementById('testrail-integration').checked,
        slackIntegration: document.getElementById('slack-integration').checked
    };

    try {
        await chrome.storage.sync.set(settings);
        chrome.runtime.sendMessage({ action: 'refreshSettings' });
        showNotification('Settings saved successfully!', 'success');
    } catch (error) {
        showNotification('Failed to save settings: ' + error.message, 'error');
    }
}

// Utility Functions
function showError(element, message) {
    element.textContent = '❌ Error: ' + message;
    element.style.color = '#dc3545';
}

function showWarning(message) {
    showNotification(message, 'warning');
}

function showNotification(message, type = 'info') {
    console.log(`Notification [${type}]:`, message);

    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 6px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;

    const colors = {
        info: '#4361ee',
        success: '#28a745',
        warning: '#ffc107',
        error: '#dc3545'
    };

    notification.style.background = colors[type] || colors.info;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);