import { showToast } from "../core/utils.js";
import { getSync, setSync } from "../core/storage.js";
let recordingState = {
    isRecording: false,
    eventCount: 0,
    startTime: null
};


// ===== TEST RECORDING (NEW) =====
export async function setupRecording() {
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
    // In recording-setup.js, update the generateCodeBtn handler:

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

        // 🔍 DEBUG: Check what preferences are loaded
        console.log("📋 User preferences:", prefs);
        console.log("🌐 Include Network?", prefs.includeNetwork);

        const options = {
            keepAllAttempts: prefs.keepAllAttempts ?? false,
            includeNetworkCalls: prefs.includeNetwork ?? false,  // ← Make sure this is true!
            includeAssertions: prefs.includeAssertions ?? true,
            includeHovers: prefs.includeHovers ?? false,
            includeScrolls: prefs.includeScrolls ?? false
        };

        console.log("🔧 Sending options:", options);

        codeCard.classList.remove("hidden");
        codeOutput.innerHTML = '<div class="loading"><div class="spinner"></div> Generating test code...</div>';

        try {
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        action: "generateAutomatedTest",
                        framework,
                        options  // ← Ensure this is passed
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
