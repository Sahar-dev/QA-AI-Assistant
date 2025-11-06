// recording/recorder.js
(function () {
    const S = (type, data = {}) => {
        try {
            chrome.runtime.sendMessage({ action: 'recordEvent', payload: { type, data, url: location.href } });
        } catch { }
    };

    // --- util: best-effort CSS selector
    const cssPath = (el) => {
        if (!el || !el.nodeType) return '';
        if (el.id) return `#${el.id}`;
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

    // --- clicks
    window.addEventListener('click', (e) => {
        const t = e.target;
        S('click', {
            selector: cssPath(t),
            text: (t.textContent || '').trim().slice(0, 120)
        });
    }, true);

    // --- inputs
    window.addEventListener('input', (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return;
        const kind = t.type || t.tagName.toLowerCase();
        const val = kind === 'password' ? '***' : (t.value || '').slice(0, 200);
        S('input', { selector: cssPath(t), kind, value: val });
    }, true);

    // --- keydowns (no text capture)
    window.addEventListener('keydown', (e) => {
        S('keydown', { key: e.key, code: e.code, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey });
    }, true);

    // --- scroll (throttled)
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const now = Date.now();
        if (now - lastScroll > 300) {
            lastScroll = now;
            S('scroll', { x: window.scrollX, y: window.scrollY });
        }
    }, { passive: true });

    // --- navigation
    const reportNav = () => S('navigation', { href: location.href, title: document.title || '' });
    reportNav();
    window.addEventListener('popstate', reportNav);
    const _pushState = history.pushState;
    history.pushState = function (...args) { _pushState.apply(this, args); setTimeout(reportNav, 0); };
    const _replaceState = history.replaceState;
    history.replaceState = function (...args) { _replaceState.apply(this, args); setTimeout(reportNav, 0); };

    // --- console errors
    const origError = console.error;
    console.error = function (...args) {
        try { S('console_error', { message: args.map(a => stringify(a)).join(' ') }); } catch { }
        return origError.apply(console, args);
    };
    window.addEventListener('error', (e) => {
        S('error', { message: e.message, source: e.filename, line: e.lineno, col: e.colno });
    });

    // --- fetch
    const origFetch = window.fetch;
    window.fetch = async function (input, init = {}) {
        const started = performance.now();
        try {
            const res = await origFetch(input, init);
            const elapsed = Math.round(performance.now() - started);
            S('fetch', {
                method: (init && init.method) || 'GET',
                url: (typeof input === 'string') ? input : (input?.url || ''),
                status: res.status,
                timeMs: elapsed
            });
            return res;
        } catch (err) {
            const elapsed = Math.round(performance.now() - started);
            S('fetch_error', {
                method: (init && init.method) || 'GET',
                url: (typeof input === 'string') ? input : (input?.url || ''),
                timeMs: elapsed,
                error: String(err && err.message || err)
            });
            throw err;
        }
    };

    // --- XHR
    const OrigXHR = window.XMLHttpRequest;
    function PatchedXHR() {
        const xhr = new OrigXHR();
        let method = 'GET', url = '';
        const started = performance.now();

        const open = xhr.open;
        xhr.open = function (m, u, ...rest) { method = m; url = u; return open.call(xhr, m, u, ...rest); };

        xhr.addEventListener('loadend', () => {
            S('xhr', {
                method, url,
                status: xhr.status,
                timeMs: Math.round(performance.now() - started)
            });
        });
        return xhr;
    }
    window.XMLHttpRequest = PatchedXHR;

    function stringify(x) {
        try { return typeof x === 'string' ? x : JSON.stringify(x); } catch { return String(x); }
    }
    // 🧩 Detect visible UI error text
    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            m.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    const text = node.textContent || "";
                    if (/invalid|error|failed|unauthorized/i.test(text)) {
                        S('ui_error', { message: text.trim().slice(0, 200) });
                    }
                }
            });
        }
    });
    function startObserver() {
        if (!document.body) {
            console.warn("[QA Copilot] Waiting for document.body...");
            return setTimeout(startObserver, 500); // retry every 500ms
        }

        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.addedNodes) {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            const text = node.textContent || "";
                            if (/invalid|error|failed|unauthorized/i.test(text)) {
                                chrome.runtime.sendMessage({
                                    action: "recordEvent",
                                    payload: {
                                        type: "ui_error",
                                        data: { message: text.trim().slice(0, 200) }
                                    }
                                });
                            }
                        }
                    });
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log("👀 QA Copilot DOM observer active");
    }

    startObserver();


})();

