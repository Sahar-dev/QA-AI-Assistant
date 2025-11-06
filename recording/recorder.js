// recording/recorder.js - Enhanced version with test intent capture
(function () {
    const S = (type, data = {}) => {
        try {
            chrome.runtime.sendMessage({
                action: 'recordEvent',
                payload: { type, data, url: location.href, timestamp: Date.now() }
            });
        } catch { }
    };

    // === CSS Selector Generator ===
    const cssPath = (el) => {
        if (!el || !el.nodeType) return '';
        if (el.id) return `#${el.id}`;

        // Prefer data-testid, data-test, or aria-label
        if (el.dataset.testid) return `[data-testid="${el.dataset.testid}"]`;
        if (el.dataset.test) return `[data-test="${el.dataset.test}"]`;
        if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;

        let path = [];
        while (el && el.nodeType === 1 && path.length < 5) {
            let seg = el.nodeName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
                const cls = el.className.trim().split(/\s+/).slice(0, 2).join('.');
                if (cls) seg += `.${cls}`;
            }
            const idx = Array.from(el.parentNode?.children || []).indexOf(el) + 1;
            seg += `:nth-child(${idx})`;
            path.unshift(seg);
            el = el.parentElement;
        }
        return path.length ? path.join(' > ') : '';
    };

    // === Click Events ===
    window.addEventListener('click', (e) => {
        const t = e.target;
        const tagName = t.tagName.toLowerCase();
        const text = (t.textContent || '').trim().slice(0, 120);

        // Detect action type
        let actionType = 'click';
        if (tagName === 'a') actionType = 'navigate';
        if (tagName === 'button' && text.toLowerCase().includes('submit')) actionType = 'submit';

        S('click', {
            selector: cssPath(t),
            text: text,
            tagName: tagName,
            actionType: actionType,
            href: t.href || null
        });
    }, true);

    // === Input Events ===
    let inputTimers = {};
    window.addEventListener('input', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;

        const selector = cssPath(t);

        // Debounce to capture final value
        clearTimeout(inputTimers[selector]);
        inputTimers[selector] = setTimeout(() => {
            const kind = t.type || t.tagName.toLowerCase();
            const val = kind === 'password' ? '***' : (t.value || '').slice(0, 200);
            const placeholder = t.placeholder || '';
            const label = document.querySelector(`label[for="${t.id}"]`)?.textContent || '';

            S('input', {
                selector,
                kind,
                value: val,
                placeholder,
                label,
                name: t.name || t.id || ''
            });
        }, 500);
    }, true);

    // === Form Submission ===
    window.addEventListener('submit', (e) => {
        const form = e.target;
        S('form_submit', {
            action: form.action,
            method: form.method,
            selector: cssPath(form)
        });
    }, true);

    // === Page Assertions (visible text changes) ===
    const observeTextChanges = () => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        const text = node.textContent.trim();

                        // Capture success/error messages
                        if (/success|completed|confirmed/i.test(text)) {
                            S('assertion', {
                                type: 'success_message',
                                text: text.slice(0, 200),
                                selector: cssPath(node)
                            });
                        }

                        if (/error|failed|invalid|unauthorized/i.test(text)) {
                            S('assertion', {
                                type: 'error_message',
                                text: text.slice(0, 200),
                                selector: cssPath(node)
                            });
                        }
                    }
                });
            });
        });

        if (document.body) {
            observer.observe(document.body, { childList: true, subtree: true });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeTextChanges);
    } else {
        observeTextChanges();
    }

    // === Navigation Tracking ===
    const reportNav = () => S('navigation', {
        href: location.href,
        title: document.title || '',
        timestamp: Date.now()
    });

    reportNav();
    window.addEventListener('popstate', reportNav);

    const _pushState = history.pushState;
    history.pushState = function (...args) {
        _pushState.apply(this, args);
        setTimeout(reportNav, 100);
    };

    const _replaceState = history.replaceState;
    history.replaceState = function (...args) {
        _replaceState.apply(this, args);
        setTimeout(reportNav, 100);
    };

    // === Network Tracking (for API verification) ===
    const origFetch = window.fetch;
    window.fetch = async function (input, init = {}) {
        const started = performance.now();
        const url = (typeof input === 'string') ? input : (input?.url || '');
        const method = (init && init.method) || 'GET';

        try {
            const res = await origFetch(input, init);
            const elapsed = Math.round(performance.now() - started);

            S('fetch', {
                method,
                url,
                status: res.status,
                timeMs: elapsed,
                timestamp: Date.now()
            });

            return res;
        } catch (err) {
            const elapsed = Math.round(performance.now() - started);
            S('fetch_error', {
                method,
                url,
                timeMs: elapsed,
                error: String(err && err.message || err)
            });
            throw err;
        }
    };

    // === Console Error Tracking ===
    window.addEventListener('error', (e) => {
        S('error', {
            message: e.message,
            source: e.filename,
            line: e.lineno
        });
    });

    console.log('🎬 QA Copilot Recorder Active');
})();