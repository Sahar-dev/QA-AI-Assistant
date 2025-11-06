console.log('✅ QA Copilot loaded');

let recordingState = {
    isRecording: false,
    eventCount: 0,
    startTime: null
};

document.addEventListener('DOMContentLoaded', () => {
    console.log('⚙️ Initializing QA Copilot UI...');
    initApp();
});

async function initApp() {
    setupNavigation();
    setupTestGeneration();
    setupAnalysis();
    setupTestData();
    setupTimeline();
    setupAccessibility();
    setupRecording(); // NEW!
    setupSettings();
    loadSavedTests();
    await loadSettings();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.savedTests) loadSavedTests();
    });

}

// ===== NAVIGATION =====
function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.tab-pane');

    async function switchTab(tabId) {
        tabs.forEach(t => t.classList.remove('active'));
        navBtns.forEach(n => n.classList.remove('active'));

        document.getElementById(tabId)?.classList.add('active');
        document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');

        const titles = {
            'test-cases': 'Test Case Generator',
            'analyze': 'Page Analyzer',
            'test-data': 'Test Recording',
            'accessibility': 'Accessibility Audit',
            'export': 'Export Tests',
            'timeline': 'Session Timeline',
            'settings': 'Settings'
        };
        document.getElementById('header-title').textContent = titles[tabId] || 'QA Copilot';

        if (tabId === 'timeline') {
            try {
                const url = chrome.runtime.getURL('timeline-view.js');
                const mod = await import(url);
                mod.renderTimeline(document.getElementById('timeline-container'));
            } catch (error) {
                console.error('Timeline load failed:', error);
            }
        }
        if (tabId === 'manual-tests') {
            loadSavedTests();
        }

    }

    chrome.storage.local.get('activeTab', (data) => {
        switchTab(data.activeTab || 'test-cases');
    });

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
            chrome.storage.local.set({ activeTab: tabId });
        });
    });
}

// ===== TEST RECORDING (NEW) =====
function setupRecording() {
    const startBtn = document.getElementById('start-recording');
    const stopBtn = document.getElementById('stop-recording');
    const statusDisplay = document.getElementById('recording-status');
    const frameworkSelect = document.getElementById('framework-select');
    const generateCodeBtn = document.getElementById('generate-code-btn');
    const codeOutput = document.getElementById('code-output');

    // Start Recording
    startBtn?.addEventListener('click', async () => {
        const testName = document.getElementById('test-name')?.value || 'Unnamed Test';
        const testDesc = document.getElementById('test-description')?.value || '';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            const response = await chrome.runtime.sendMessage({
                action: 'startRecordingSession',
                metadata: {
                    testName: testName,
                    testDescription: testDesc,
                    startUrl: tab.url
                }
            });

            if (response.success) {
                recordingState.isRecording = true;
                recordingState.startTime = Date.now();
                updateRecordingUI();
                showToast('🎬 Recording started!', 'success');

                // Start event counter
                startEventCounter();
            }
        } catch (error) {
            showToast('Failed to start recording', 'error');
            console.error(error);
        }
    });

    // Stop Recording
    stopBtn?.addEventListener('click', async () => {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'stopRecordingSession'
            });

            if (response.success) {
                recordingState.isRecording = false;
                updateRecordingUI();
                const events = response.data || response.events || [];
                showToast(`🛑 Recording stopped! Captured ${events.length} events`, 'success');

                // Show framework selection
                document.getElementById('framework-selection')?.classList.remove('hidden');
            }
        } catch (error) {
            showToast('Failed to stop recording', 'error');
            console.error(error);
        }
    });

    // Generate Automated Test
    // Generate Automated Test
    generateCodeBtn?.addEventListener("click", async () => {
        const framework = frameworkSelect?.value || "cypress";
        const codeCard = document.getElementById("code-output-card");
        const codeOutput = document.getElementById("code-output");

        // show code card and loader
        codeCard.classList.remove("hidden");
        codeOutput.innerHTML =
            '<div class="loading"><div class="spinner"></div> Generating test code...</div>';

        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    { action: "generateAutomatedTest", framework },
                    (res) => {
                        if (chrome.runtime.lastError) {
                            console.error("⏳ runtime.lastError:", chrome.runtime.lastError.message);
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(res);
                        }
                    }
                );
            });

            if (response?.success) {
                // ✅ show the generated code
                codeOutput.textContent = response.code;
                showToast("✨ Test code generated!", "success");
                setTimeout(loadSavedTests, 500);
            } else {
                throw new Error(response?.error || "Unknown error");
            }
        } catch (error) {
            codeOutput.textContent = `Error: ${error.message}`;
            showToast("Generation failed", "error");
        }
    });



    // Copy generated code
    document.getElementById('copy-code-btn')?.addEventListener('click', () => {
        copyToClipboard('code-output');
    });

    // Download generated code
    document.getElementById('download-code-btn')?.addEventListener('click', () => {
        const code = document.getElementById('code-output').textContent;
        const framework = frameworkSelect?.value || 'cypress';

        const extensions = {
            cypress: 'cy.js',
            playwright: 'spec.js',
            selenium: 'java',
            puppeteer: 'js'
        };

        downloadFile(code, `test.${extensions[framework]}`, 'text/plain');
        showToast('Downloaded!', 'success');
    });
}
async function loadSavedTests() {
    const container = document.getElementById("saved-tests-container");
    const data = await chrome.storage.local.get("savedTests");
    const tests = data.savedTests || [];

    if (!tests.length) {
        container.innerHTML = `
      <tr class="output-empty">
        <td colspan="6" style="text-align:center;padding:12px;color:#9ca3af;">
          <i class="fas fa-box-open" style="font-size:16px;margin-right:6px;opacity:0.5;"></i>
          No recorded tests yet.
        </td>
      </tr>`;
        return;
    }

    container.innerHTML = tests
        .map(
            (t, i) => `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:6px 8px;font-weight:600;color:#4f46e5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${t.testName || "Unnamed Test"}
        </td>
        <td style="padding:6px 8px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${t.testDescription || "—"}
        </td>
        <td style="padding:6px 8px;">${t.framework?.toUpperCase()}</td>
        <td style="padding:6px 8px;text-align:center;">${t.eventCount}</td>
        <td style="padding:6px 8px;color:#6b7280;white-space:nowrap;">
          ${new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </td>
        <td style="padding:6px 8px;text-align:right;">
          <button class="btn btn-ghost btn-sm copy-btn" data-index="${i}" title="Copy Code">
            <i class="fas fa-copy"></i>
          </button>
          <button class="btn btn-ghost btn-sm delete-btn" data-index="${i}" title="Delete" style="color:#ef4444;">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>`
        )
        .join("");

    // Actions
    container.querySelectorAll(".copy-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            const idx = e.currentTarget.dataset.index;
            await navigator.clipboard.writeText(tests[idx].code);
            showToast("Copied to clipboard!", "success");
        });
    });

    container.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            const idx = e.currentTarget.dataset.index;
            if (!confirm(`Delete test "${tests[idx].testName}"?`)) return;
            const newTests = tests.filter((_, i) => i !== parseInt(idx));
            await chrome.storage.local.set({ savedTests: newTests });
            showToast("Deleted!", "success");
            loadSavedTests();
        });
    });
}


function updateRecordingUI() {
    const startBtn = document.getElementById('start-recording');
    const stopBtn = document.getElementById('stop-recording');
    const statusDisplay = document.getElementById('recording-status');

    if (recordingState.isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusDisplay.textContent = `🔴 Recording... (${recordingState.eventCount} events)`;
        statusDisplay.style.color = '#ef4444';
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusDisplay.textContent = '⚪ Not recording';
        statusDisplay.style.color = '#64748b';
    }
}

function startEventCounter() {
    const interval = setInterval(async () => {
        if (!recordingState.isRecording) {
            clearInterval(interval);
            return;
        }

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getRecordingState'
            });

            if (response.success) {
                recordingState.eventCount = response.eventCount;
                updateRecordingUI();
            }
        } catch (error) {
            console.error('Failed to get recording state:', error);
        }
    }, 1000);
}

// ===== TIMELINE TAB =====
function setupTimeline() {
    const container = document.getElementById('timeline-container');

    async function getTimelineModule() {
        if (!window._timelineModule) {
            const url = chrome.runtime.getURL('timeline-view.js');
            window._timelineModule = await import(url);
        }
        return window._timelineModule;
    }

    document.getElementById('refresh-timeline')?.addEventListener('click', async () => {
        try {
            const mod = await getTimelineModule();
            mod.renderTimeline(container);
        } catch (error) {
            console.error('Timeline refresh failed:', error);
        }
    });

    setInterval(async () => {
        const tabPane = document.getElementById('timeline');
        if (tabPane?.classList.contains('active')) {
            try {
                const mod = await getTimelineModule();
                mod.renderTimeline(container);
            } catch (error) {
                console.error('Timeline auto-refresh failed:', error);
            }
        }
    }, 10000);

    document.getElementById('report-bug-btn')?.addEventListener('click', async () => {
        try {
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

            downloadFile(md, `bug-report-${Date.now()}.md`, 'text/markdown');
            showToast('Bug report exported', 'success');
        } catch (error) {
            console.error('Bug report failed:', error);
            showToast('Failed to export bug report', 'error');
        }
    });
}

// ===== TEST GENERATION =====
function setupTestGeneration() {
    document.getElementById('generate-btn')?.addEventListener('click', handleGenerateTestCases);
    document.getElementById('extract-btn')?.addEventListener('click', handleExtractPage);
    document.getElementById('copy-tests-btn')?.addEventListener('click', () => {
        copyToClipboard('test-output');
    });
}

async function handleGenerateTestCases() {
    const featureText = document.getElementById('feature-input').value.trim();
    const testType = document.getElementById('test-type').value;
    const riskLevel = document.getElementById('risk-level').value;
    const output = document.getElementById('test-output');

    if (!featureText) {
        showToast('Please describe the feature first', 'error');
        return;
    }

    output.innerHTML = '<div class="loading"><div class="spinner"></div> Generating tests...</div>';

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'generateTestCases',
            data: { featureText, testType, riskLevel }
        });

        if (response?.success) {
            output.textContent = response.testCases;
            if (response.fallback) {
                showToast('Using fallback generation', 'warning');
            } else {
                showToast('Tests generated!', 'success');
            }
        }
    } catch (error) {
        output.textContent = 'Error: ' + error.message;
        showToast('Generation failed', 'error');
    }
}

async function handleExtractPage() {
    const output = document.getElementById('feature-input');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await chrome.runtime.sendMessage({
            action: 'extractPageContent',
            tabId: tab.id
        });

        if (response?.success) {
            const data = response.data?.data || {};
            const extracted = `Page: ${data.title || 'Unknown'}
URL: ${data.url || ''}

Form Fields: ${data.inputs?.map(i => i.name).join(', ') || 'None'}
Buttons: ${data.buttons?.join(', ') || 'None'}`;

            output.value = extracted;
            showToast('Page content extracted!', 'success');
        }
    } catch (error) {
        showToast('Failed to extract page', 'error');
    }
}

// ===== ACCESSIBILITY =====
function setupAccessibility() {
    document.getElementById('run-a11y-btn')?.addEventListener('click', handleAccessibilityAudit);
    document.getElementById('copy-a11y-btn')?.addEventListener('click', () => {
        copyToClipboard('a11y-output');
    });
}

async function handleAccessibilityAudit() {
    const output = document.getElementById('a11y-output');
    output.innerHTML = '<div class="loading"><div class="spinner"></div> Running audit...</div>';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const response = await chrome.runtime.sendMessage({
            action: 'analyzeAccessibility',
            tabId: tab.id
        });

        if (response?.success) {
            const results = response.results;
            output.textContent = `✅ ${results.summary}\n\nIssues: ${results.totalIssues}`;
            showToast('Audit complete!', 'success');
        }
    } catch (error) {
        output.textContent = 'Error: ' + error.message;
        showToast('Audit failed', 'error');
    }
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
    return `📊 PAGE STRUCTURE\n\nTitle: ${data.title}\nHeadings: ${data.headings?.length || 0}`;
}

function analyzeForms(data) {
    return `📝 FORM ANALYSIS\n\nFields: ${data.inputs?.length || 0}`;
}

function analyzeLinks(data) {
    return `🔗 NAVIGATION\n\nLinks: ${data.links?.length || 0}`;
}

// ===== TEST DATA =====
function setupTestData() {
    // Remove old data generation, keep only recording
}

// ===== SETTINGS =====
function setupSettings() {
    document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);

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
        .then(() => showToast('Copied!', 'success'))
        .catch(() => showToast('Failed to copy', 'error'));
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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

const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        to { opacity: 0; transform: translateX(400px); }
    }
    .hidden { display: none !important; }
`;
document.head.appendChild(style);