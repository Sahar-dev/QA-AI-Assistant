// recording/recorder.js - Enhanced version with smart filtering
(function () {
    // ===== STATE MANAGEMENT =====
    let lastClickedElement = null;
    let lastClickTime = 0;
    let lastInputSelector = null;
    let navigationReported = false;
    let maskPasswords = false;

    // Load password masking preference
    chrome.storage.sync.get("maskPasswords", (data) => {
        maskPasswords = data.maskPasswords ?? false;
    });

    // ===== MESSAGE SENDER =====
    const sendEvent = (type, data = {}) => {
        try {
            chrome.runtime.sendMessage({
                action: 'recordEvent',
                payload: {
                    type,
                    data,
                    url: location.href,
                    timestamp: Date.now()
                }
            });
        } catch (err) {
            console.warn('Failed to send event:', err);
        }
    };

    // ===== IMPROVED CSS SELECTOR GENERATOR =====
    const generateSelector = (el) => {
        if (!el || !el.nodeType) return '';

        // 1. Prefer ID (most stable)
        if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
            return `#${el.id}`;
        }

        // 2. Prefer data-testid (best practice)
        if (el.dataset.testid) {
            return `[data-testid="${el.dataset.testid}"]`;
        }
        if (el.dataset.test) {
            return `[data-test="${el.dataset.test}"]`;
        }

        // 3. Prefer aria-label (accessibility)
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) {
            return `[aria-label="${ariaLabel}"]`;
        }

        // 4. Form inputs with name
        if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && el.name) {
            return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
        }

        // 5. Build path with classes (max 3 levels)
        const path = [];
        let current = el;
        let depth = 0;

        while (current && current.nodeType === 1 && depth < 3) {
            let segment = current.nodeName.toLowerCase();

            // Add meaningful classes only
            if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim()
                    .split(/\s+/)
                    .filter(c => !c.match(/^(active|selected|focus|hover|js-)/)) // Exclude state classes
                    .slice(0, 2);

                if (classes.length > 0) {
                    segment += '.' + classes.join('.');
                }
            }

            // Add nth-child only if needed
            const siblings = Array.from(current.parentNode?.children || [])
                .filter(s => s.nodeName === current.nodeName);

            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                segment += `:nth-child(${index})`;
            }

            path.unshift(segment);
            current = current.parentElement;
            depth++;
        }

        return path.length ? path.join(' > ') : 'body';
    };

    // ===== SMART CLICK HANDLER =====
    window.addEventListener('click', (e) => {
        const target = e.target;
        const tagName = target.tagName.toLowerCase();
        const text = (target.textContent || '').trim().slice(0, 120);
        const selector = generateSelector(target);

        // Store click context
        lastClickedElement = target;
        lastClickTime = Date.now();

        // Skip clicks on form inputs (they'll be captured by input event)
        if (['input', 'textarea', 'select'].includes(tagName)) {
            lastInputSelector = selector;
            return;
        }

        // Determine action type
        let actionType = 'click';
        if (tagName === 'a' && target.href) {
            actionType = 'navigate';
        } else if (tagName === 'button' || target.type === 'submit') {
            if (text.toLowerCase().includes('submit') ||
                text.toLowerCase().includes('login') ||
                text.toLowerCase().includes('sign in')) {
                actionType = 'submit';
            }
        }

        sendEvent('click', {
            selector,
            text,
            tagName,
            actionType,
            href: target.href || null
        });
    }, true);

    // ===== SMART INPUT HANDLER (DEBOUNCED) =====
    const inputTimers = {};

    window.addEventListener('input', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
            return;
        }

        const selector = generateSelector(target);

        // Clear existing timer for this field
        clearTimeout(inputTimers[selector]);

        // Debounce: wait 500ms after last keystroke
        inputTimers[selector] = setTimeout(() => {
            const fieldType = target.type || 'text';
            const value = maskPasswords && fieldType === 'password'
                ? '***'
                : (target.value || '').slice(0, 200);

            // Get label text
            const labelText = target.labels?.[0]?.textContent?.trim() ||
                document.querySelector(`label[for="${target.id}"]`)?.textContent?.trim() ||
                target.placeholder ||
                target.name ||
                '';

            sendEvent('input', {
                selector,
                kind: fieldType,
                value,
                placeholder: target.placeholder || '',
                label: labelText,
                name: target.name || target.id || ''
            });

            // Reset input selector tracking
            lastInputSelector = null;
        }, 500);
    }, true);

    // ===== FORM SUBMISSION HANDLER =====
    window.addEventListener('submit', (e) => {
        const form = e.target;
        sendEvent('form_submit', {
            action: form.action || '',
            method: (form.method || 'GET').toUpperCase(),
            selector: generateSelector(form)
        });
    }, true);

    // ===== SMART MUTATION OBSERVER FOR ASSERTIONS =====
    const observePageChanges = () => {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;

                    const text = node.textContent?.trim() || '';
                    if (text.length < 5 || text.length > 200) continue;

                    // Success messages
                    if (/success|successfully|completed|confirmed|welcome|logged in/i.test(text)) {
                        sendEvent('assertion', {
                            type: 'success_message',
                            text,
                            selector: generateSelector(node)
                        });
                    }

                    // Error messages
                    else if (/error|failed|invalid|incorrect|unauthorized|denied|wrong/i.test(text)) {
                        sendEvent('assertion', {
                            type: 'error_message',
                            text,
                            selector: generateSelector(node)
                        });
                    }

                    // Warning messages
                    else if (/warning|caution|attention|note/i.test(text)) {
                        sendEvent('assertion', {
                            type: 'warning_message',
                            text,
                            selector: generateSelector(node)
                        });
                    }
                }
            }
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observePageChanges);
    } else {
        observePageChanges();
    }

    // ===== SMART NAVIGATION TRACKING =====
    const reportNavigation = () => {
        const url = location.href;

        // Skip cloudflare, analytics, tracking URLs
        if (url.includes('cloudflare.com') ||
            url.includes('analytics') ||
            url.includes('tracking') ||
            url.includes('cdn-cgi')) {
            return;
        }

        sendEvent('navigation', {
            href: url,
            title: document.title || '',
            timestamp: Date.now()
        });

        navigationReported = true;
    };

    // Report initial navigation
    if (!navigationReported) {
        setTimeout(reportNavigation, 100);
    }

    // Track SPA navigation
    window.addEventListener('popstate', reportNavigation);

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        setTimeout(reportNavigation, 100);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        setTimeout(reportNavigation, 100);
    };

    // ===== NETWORK INTERCEPTION (FETCH) =====
    const originalFetch = window.fetch;
    window.fetch = async function (input, init = {}) {
        const startTime = performance.now();
        const url = typeof input === 'string' ? input : input?.url || '';
        const method = init.method || 'GET';

        // Skip tracking/analytics URLs
        if (url.includes('analytics') ||
            url.includes('tracking') ||
            url.includes('gtm') ||
            url.includes('facebook') ||
            url.includes('google-analytics')) {
            return originalFetch(input, init);
        }

        try {
            const response = await originalFetch(input, init);
            const elapsed = Math.round(performance.now() - startTime);

            sendEvent('fetch', {
                method,
                url,
                status: response.status,
                timeMs: elapsed,
                timestamp: Date.now()
            });

            return response;
        } catch (error) {
            const elapsed = Math.round(performance.now() - startTime);

            sendEvent('fetch_error', {
                method,
                url,
                timeMs: elapsed,
                error: error.message || String(error)
            });

            throw error;
        }
    };

    // ===== CONSOLE ERROR TRACKING =====
    window.addEventListener('error', (e) => {
        sendEvent('error', {
            message: e.message,
            source: e.filename,
            line: e.lineno,
            column: e.colno
        });
    });

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', (e) => {
        sendEvent('error', {
            message: `Unhandled Promise Rejection: ${e.reason}`,
            source: 'promise',
            line: 0
        });
    });

    console.log('🎬 QA Copilot Recorder Active (Enhanced)');
})();