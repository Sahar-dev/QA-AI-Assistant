import { showToast } from "../core/utils.js";
import { getSync, setSync } from "../core/storage.js";
export async function setupAnalysis() {
    const actions = ['analyze-structure', 'analyze-forms', 'analyze-links', 'analyze-full'];

    actions.forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => handleAnalysis(id));
    });

    document.getElementById('copy-analysis-btn')?.addEventListener('click', () => {
        copyToClipboard('analyze-output');
    });
}

export async function handleAnalysis(type) {
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