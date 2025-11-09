// background/extraction.js
export async function handleExtraction(tabId) {
    if (!tabId) return { success: false, error: "No tab ID provided" };

    const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractPageData,
    });

    return { success: true, data: results[0].result };
}

// Runs in page context
function extractPageData() {
    const url = window.location.href;
    const title = document.title || '';
    const selectedText = window.getSelection().toString();

    // Extract form inputs
    const inputs = Array.from(document.querySelectorAll('input, select, textarea'))
        .slice(0, 20) // Limit to first 20
        .map(el => ({
            name: el.name || el.id || el.placeholder || 'unnamed',
            type: el.type || el.tagName.toLowerCase(),
            placeholder: el.placeholder || '',
            required: el.required || false
        }));

    // Extract buttons
    const buttons = Array.from(document.querySelectorAll('button, [type="submit"], [type="button"]'))
        .slice(0, 10)
        .map(btn => btn.textContent.trim())
        .filter(text => text && text.length < 50);

    // Extract links
    const links = Array.from(document.querySelectorAll('a[href]'))
        .slice(0, 10)
        .map(a => ({
            text: a.textContent.trim().substring(0, 50),
            href: a.href
        }))
        .filter(link => link.text);

    // Extract headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .slice(0, 10)
        .map(h => h.textContent.trim())
        .filter(text => text);

    return {
        pageType: 'GENERIC',
        data: {
            title,
            url,
            selectedText,
            inputs,
            buttons,
            links,
            headings
        }
    };
}
