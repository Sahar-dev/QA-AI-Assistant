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
    setupCollections();
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
async function setupCollections() {
    const list = document.getElementById('collections-list');
    const input = document.getElementById('new-collection-name');
    const addBtn = document.getElementById('add-collection-btn');

    const modal = document.getElementById('collection-modal');
    const modalTitle = document.getElementById('collection-modal-title');
    const modalBody = document.getElementById('collection-tests-list');
    const exportBtn = document.getElementById('export-collection-btn');
    const clearBtn = document.getElementById('clear-collection-btn');
    const closeModal = document.getElementById('close-collection-modal');

    // ====== Render all collections ======
    async function renderCollections() {
        const data = await chrome.storage.local.get(['collections', 'activeCollection']);
        const collections = data.collections || [];
        const active = data.activeCollection;

        if (!collections.length) {
            list.innerHTML = `<div class="output-empty">No collections yet.</div>`;
            return;
        }

        list.innerHTML = collections.map(c => `
  <div class="collection-item ${active === c.id ? 'active' : ''}" data-id="${c.id}">
    <div class="collection-item-header">
      <div class="collection-item-title">${c.name}</div>
      <div class="collection-item-actions">
        <button class="view-collection" data-id="${c.id}" title="View tests">
          <i class="fas fa-eye" style="color:#475569;"></i>
        </button>
        <button class="delete-collection" data-id="${c.id}" title="Delete">
          <i class="fas fa-trash" style="color:#dc2626;"></i>
        </button>
      </div>
    </div>
    <div class="collection-item-meta">${(c.tests || []).length} tests</div>
  </div>
`).join('');
    }

    // ====== Add new collection ======
    addBtn?.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) return showToast('Enter a name first', 'error');

        const id = name.toLowerCase().replace(/\s+/g, '-');
        const data = await chrome.storage.local.get('collections');
        const collections = data.collections || [];

        if (collections.some(c => c.id === id)) {
            showToast('Collection already exists', 'error');
            return;
        }

        collections.push({ id, name, tests: [] });
        await chrome.storage.local.set({ collections, activeCollection: id });
        input.value = '';
        showToast(`🗂️ Collection "${name}" added`, 'success');
        renderCollections();
    });

    // ====== Handle clicks inside collection list ======
    list?.addEventListener('click', async (e) => {
        const viewBtn = e.target.closest('.view-collection');
        const deleteBtn = e.target.closest('.delete-collection');
        const item = e.target.closest('.collection-item');
        if (!item) return;

        const id = viewBtn?.dataset.id || deleteBtn?.dataset.id || item.dataset.id;
        if (!id) return;

        const data = await chrome.storage.local.get('collections');
        const collections = data.collections || [];
        const collection = collections.find(c => c.id === id);
        if (!collection) return;

        // Delete collection
        if (deleteBtn) {
            if (confirm(`Delete collection "${collection.name}"?`)) {
                const updated = collections.filter(c => c.id !== id);
                await chrome.storage.local.set({ collections: updated });
                showToast(`🗑️ Deleted "${collection.name}"`, 'info');
                renderCollections();
            }
            return;
        }

        // Select active collection
        await chrome.storage.local.set({ activeCollection: id });
        showToast(`📁 Active collection set: ${collection.name}`, 'info');
        renderCollections();

        // View collection in modal
        if (viewBtn) {
            modal.classList.remove('hidden');
            modalTitle.textContent = `Collection: ${collection.name}`;

            if (!collection.tests?.length) {
                modalBody.innerHTML = `<div style="color:#666;">No tests yet in this collection.</div>`;
            } else {
                modalBody.innerHTML = collection.tests.map(t => `
          <div style="border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:6px;">
            <strong>${t.testName}</strong>
            <div style="font-size:11px;color:#777;">${t.testDescription || 'No description'}</div>
            <div style="font-size:10px;color:#aaa;">${new Date(t.createdAt).toLocaleString()}</div>
          </div>
        `).join('');
            }

            exportBtn.dataset.id = id;
            clearBtn.dataset.id = id;
        }
    });

    // ====== Close modal ======
    closeModal?.addEventListener('click', () => modal.classList.add('hidden'));
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    // ====== Export collection as Cypress suite ======
    exportBtn?.addEventListener('click', async () => {
        const id = exportBtn.dataset.id;
        if (!id) return;

        const data = await chrome.storage.local.get('collections');
        const collection = (data.collections || []).find(c => c.id === id);
        if (!collection || !collection.tests?.length) {
            showToast('No tests to export', 'error');
            return;
        }

        const suiteName = collection.name;

        // Extract inner test body only (remove outer describe/it)
        const codeBlocks = collection.tests.map((t, i) => {
            let body = '';
            try {
                // Get content inside the first "it(... => { ... })"
                const itMatch = t.code.match(/it\s*\([^)]*?\{\s*([\s\S]*?)\s*\}\s*\)\s*;/);
                if (itMatch && itMatch[1]) body = itMatch[1].trim();
                else {
                    // fallback — just take anything between first and last brace
                    const braceStart = t.code.indexOf('{');
                    const braceEnd = t.code.lastIndexOf('}');
                    if (braceStart !== -1 && braceEnd !== -1) {
                        body = t.code.substring(braceStart + 1, braceEnd - 1).trim();
                    }
                }

                // 🧹 Cleanup: remove nested describe/it lines if present
                body = body
                    .replace(/describe\s*\([^)]*\)\s*\{[\s\S]*?\}/g, '')
                    .replace(/it\s*\([^)]*\)\s*\{/, '')
                    .replace(/\}\s*$/, '')
                    .trim();

            } catch (err) {
                console.warn('Failed to parse test body:', err);
            }

            // Metadata header for each test
            const metaHeader = [
                `  /**`,
                `   * Test: ${t.testName}`,
                `   * Description: ${t.testDescription || 'No description'}`,
                `   * Recorded: ${new Date(t.createdAt).toLocaleString()}`,
                `   */`
            ].join('\n');

            return `
${metaHeader}
  it('${t.testName || `Test ${i + 1}`}', () => {
    ${body || '// [No recorded steps found]'}
  });`;
        }).join('\n');

        const suiteCode = `/**
 * Test Suite: ${suiteName}
 * Total Tests: ${collection.tests.length}
 * Exported: ${new Date().toLocaleString()}
 */
describe('${suiteName}', () => {
${codeBlocks}
});
`;

        const filename = `${suiteName.toLowerCase().replace(/\s+/g, '_')}_suite.cy.js`;
        downloadFile(suiteCode, filename, 'text/plain');
        showToast(`📦 Exported ${collection.tests.length} tests`, 'success');
    });


    // ====== Clear all tests from a collection ======
    clearBtn?.addEventListener('click', async () => {
        const id = clearBtn.dataset.id;
        const data = await chrome.storage.local.get('collections');
        const collections = data.collections || [];
        const collection = collections.find(c => c.id === id);
        if (!collection) return;

        if (confirm(`Clear all tests in "${collection.name}"?`)) {
            collection.tests = [];
            await chrome.storage.local.set({ collections });
            showToast('🧹 Tests cleared', 'info');
            modalBody.innerHTML = `<div style="color:#666;">No tests yet in this collection.</div>`;
        }
    });

    // ====== Initial render ======
    renderCollections();
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

    // Load saved preferences
    chrome.storage.local.get(['keepAllAttempts', 'includeNetwork', 'includeAssertions', 'includeHovers', 'includeScrolls'], (data) => {
        document.getElementById('keep-all-attempts-toggle').checked = data.keepAllAttempts ?? false;
        document.getElementById('include-network-toggle').checked = data.includeNetwork ?? false;
        document.getElementById('include-assertions-toggle').checked = data.includeAssertions ?? true;
        document.getElementById('include-hovers-toggle').checked = data.includeHovers ?? false;
        document.getElementById('include-scrolls-toggle').checked = data.includeScrolls ?? false;
    });

    // Save preferences when changed
    const savePreference = (key, element) => {
        element?.addEventListener('change', (e) => {
            chrome.storage.local.set({ [key]: e.target.checked });
        });
    };

    savePreference('keepAllAttempts', document.getElementById('keep-all-attempts-toggle'));
    savePreference('includeNetwork', document.getElementById('include-network-toggle'));
    savePreference('includeAssertions', document.getElementById('include-assertions-toggle'));
    savePreference('includeHovers', document.getElementById('include-hovers-toggle'));
    savePreference('includeScrolls', document.getElementById('include-scrolls-toggle'));

    // Preset Buttons
    document.getElementById('preset-basic')?.addEventListener('click', () => {
        document.getElementById('keep-all-attempts-toggle').checked = false;
        document.getElementById('include-network-toggle').checked = false;
        document.getElementById('include-assertions-toggle').checked = true;
        document.getElementById('include-hovers-toggle').checked = false;
        document.getElementById('include-scrolls-toggle').checked = false;

        chrome.storage.local.set({
            keepAllAttempts: false,
            includeNetwork: false,
            includeAssertions: true,
            includeHovers: false,
            includeScrolls: false
        });

        showToast('✅ Basic preset applied', 'success');
    });

    document.getElementById('preset-comprehensive')?.addEventListener('click', () => {
        document.getElementById('keep-all-attempts-toggle').checked = true;
        document.getElementById('include-network-toggle').checked = true;
        document.getElementById('include-assertions-toggle').checked = true;
        document.getElementById('include-hovers-toggle').checked = true;
        document.getElementById('include-scrolls-toggle').checked = true;

        chrome.storage.local.set({
            keepAllAttempts: true,
            includeNetwork: true,
            includeAssertions: true,
            includeHovers: true,
            includeScrolls: true
        });

        showToast('✅ Comprehensive preset applied', 'success');
    });

    document.getElementById('preset-minimal')?.addEventListener('click', () => {
        document.getElementById('keep-all-attempts-toggle').checked = false;
        document.getElementById('include-network-toggle').checked = false;
        document.getElementById('include-assertions-toggle').checked = false;
        document.getElementById('include-hovers-toggle').checked = false;
        document.getElementById('include-scrolls-toggle').checked = false;

        chrome.storage.local.set({
            keepAllAttempts: false,
            includeNetwork: false,
            includeAssertions: false,
            includeHovers: false,
            includeScrolls: false
        });

        showToast('✅ Minimal preset applied', 'success');
    });

    // Update the generateCodeBtn click handler:
    generateCodeBtn?.addEventListener("click", async () => {
        const framework = frameworkSelect?.value || "cypress";
        const codeCard = document.getElementById("code-output-card");
        const codeOutput = document.getElementById("code-output");

        // Get user preferences
        const prefs = await chrome.storage.local.get([
            'keepAllAttempts',
            'includeNetwork',
            'includeAssertions',
            'includeHovers',
            'includeScrolls'
        ]);

        codeCard.classList.remove("hidden");
        codeOutput.innerHTML = '<div class="loading"><div class="spinner"></div> Generating test code...</div>';

        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        action: "generateAutomatedTest",
                        framework,
                        options: {
                            keepAllAttempts: prefs.keepAllAttempts ?? false,
                            includeNetworkCalls: prefs.includeNetwork ?? false,
                            includeAssertions: prefs.includeAssertions ?? true,
                            includeHovers: prefs.includeHovers ?? false,
                            includeScrolls: prefs.includeScrolls ?? false
                        }
                    },
                    (res) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(res);
                        }
                    }
                );
            });

            if (response?.success) {
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
      <div class="output-empty" style="text-align:center;padding:20px;color:#9ca3af;">
        <i class="fas fa-box-open" style="font-size:22px;margin-bottom:6px;display:block;opacity:0.5;"></i>
        No recorded tests yet.
      </div>`;
        return;
    }

    container.innerHTML = tests
        .map(
            (t, i) => `
      <div class="test-card">
        <div class="test-card-header">
          <div class="test-card-title">${t.testName || "Unnamed Test"}</div>
          <div class="test-card-actions">
            <button class="btn btn-ghost btn-xs copy-btn" data-index="${i}" title="Copy Code">
              <i class="fas fa-copy"></i>
            </button>
            <button class="btn btn-ghost btn-xs delete-btn" data-index="${i}" title="Delete" style="color:#ef4444;">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="test-card-body">
          <div class="test-card-meta">
            <span><i class="fas fa-code-branch"></i> ${t.framework?.toUpperCase() || "N/A"}</span>
            <span><i class="fas fa-bolt"></i> ${t.eventCount} events</span>
          </div>
          <div class="test-card-desc">${t.testDescription || "No description provided."}</div>
          <div class="test-card-footer">
            <i class="far fa-clock"></i>
            ${new Date(t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>`
        )
        .join("");

    // Bind Copy/Delete buttons
    container.querySelectorAll(".copy-btn").forEach(btn => {
        btn.addEventListener("click", async e => {
            const index = e.currentTarget.dataset.index;
            const code = tests[index].code;
            await navigator.clipboard.writeText(code);
            showToast("✅ Code copied!", "success");
        });
    });

    container.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", async e => {
            const index = e.currentTarget.dataset.index;
            const updated = [...tests];
            const removed = updated.splice(index, 1);
            await chrome.storage.local.set({ savedTests: updated });
            showToast(`🗑️ Deleted "${removed[0]?.testName}"`, "info");
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

    // 🧠 Mask Passwords toggle
    const maskToggle = document.getElementById("mask-passwords-toggle");

    // Load saved value
    chrome.storage.sync.get("maskPasswords", (data) => {
        maskToggle.checked = data.maskPasswords ?? false;
    });

    // Save instantly when changed
    maskToggle.addEventListener("change", () => {
        chrome.storage.sync.set({ maskPasswords: maskToggle.checked });
        showToast(
            maskToggle.checked
                ? "🔒 Password masking enabled — passwords will appear as ***"
                : "🔓 Password masking disabled — real passwords will be recorded",
            "info"
        );
    });
}

async function loadSettings() {
    try {
        const settings = await chrome.storage.sync.get(['apiKey', 'aiProvider', 'maskPasswords']);
        if (settings.apiKey) {
            document.getElementById('api-key').value = settings.apiKey;
        }
        if (settings.aiProvider) {
            document.getElementById('ai-provider').value = settings.aiProvider;
        }
        if (settings.maskPasswords !== undefined) {
            document.getElementById('mask-passwords-toggle').checked = settings.maskPasswords;
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveSettings() {
    const apiKey = document.getElementById('api-key').value;
    const aiProvider = document.getElementById('ai-provider').value;
    const maskPasswords = document.getElementById('mask-passwords-toggle')?.checked || false;

    try {
        await chrome.storage.sync.set({ apiKey, aiProvider, maskPasswords });
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