// recording/recorder-injected.js
// This runs in the page's MAIN world and can intercept fetch
(function () {
    console.log("🎬 Recorder injected script starting (MAIN world)...");

    // ===== STATE MANAGEMENT =====
    let lastClickedElement = null;
    let lastClickTime = 0;
    let lastInputSelector = null;
    let navigationReported = false;
    let dragState = null;
    let hoverTimer = null;

    // Send events to content script via window.postMessage
    const sendEvent = (type, data = {}) => {
        const message = {
            __qaRecorderEvent: true,
            type,
            data,
            url: location.href,
            timestamp: Date.now(),
            sessionId: window.__qaSessionId // Include session ID
        };

        // Log ALL events for debugging
        console.log("📤 Injected script sending event:", type, data);

        // Post to window for content script bridge to catch
        window.postMessage(message, '*');

        // Also try direct dispatch as custom event (backup)
        window.dispatchEvent(new CustomEvent('__qaRecorderEvent', {
            detail: message
        }));
    };

    // ===== IMPROVED CSS SELECTOR GENERATOR =====
    const generateSelector = (el) => {
        if (!el || !el.nodeType) return '';

        // 1. Prefer ID
        if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
            return `#${el.id}`;
        }

        // 2. Prefer data-testid
        if (el.dataset.testid) return `[data-testid="${el.dataset.testid}"]`;
        if (el.dataset.test) return `[data-test="${el.dataset.test}"]`;

        // 3. Prefer aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return `[aria-label="${ariaLabel}"]`;

        // 4. Form inputs with name
        if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && el.name) {
            return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
        }

        // 5. Build path with classes
        const path = [];
        let current = el;
        let depth = 0;

        while (current && current.nodeType === 1 && depth < 3) {
            let segment = current.nodeName.toLowerCase();

            if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim()
                    .split(/\s+/)
                    .filter(c => !c.match(/^(active|selected|focus|hover|js-|is-)/))
                    .slice(0, 2);

                if (classes.length > 0) {
                    segment += '.' + classes.join('.');
                }
            }

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

    function scoreSelector(s) {
        if (!s) return 0;
        if (s.startsWith('#')) return 100;
        if (/\[data-test(id)?=/.test(s)) return 90;
        if (/\[aria-label=/.test(s)) return 80;
        if (/input|button|select|a/.test(s)) return 60;
        return 40;
    }

    // prefer best between multiple candidates
    function chooseBestSelector(el) {
        const candidates = [];
        if (el.id) candidates.push(`#${el.id}`);
        if (el.dataset.testid) candidates.push(`[data-testid="${el.dataset.testid}"]`);
        if (el.getAttribute('aria-label')) candidates.push(`[aria-label="${el.getAttribute('aria-label')}"]`);
        candidates.push(generateSelector(el));
        return candidates.sort((a, b) => scoreSelector(b) - scoreSelector(a))[0];
    }

    // ===== 1. CLICK HANDLER (Enhanced) =====
    window.addEventListener('click', (e) => {
        const target = e.target;
        const tagName = target.tagName.toLowerCase();
        const text = (target.textContent || '').trim().slice(0, 120);
        const selector = chooseBestSelector(target);

        lastClickedElement = target;
        lastClickTime = Date.now();

        // Skip clicks on form inputs (handled by input event)
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

    // ===== 2. INPUT HANDLER (Debounced) =====
    const inputTimers = {};

    window.addEventListener('input', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
            return;
        }

        const selector = chooseBestSelector(target);

        clearTimeout(inputTimers[selector]);

        inputTimers[selector] = setTimeout(() => {
            const fieldType = target.type || 'text';
            const value = (target.value || '').slice(0, 200);

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

            lastInputSelector = null;
        }, 500);
    }, true);

    // ===== 3. SELECT/DROPDOWN HANDLER =====
    window.addEventListener('change', (e) => {
        const target = e.target;

        if (target.tagName === 'SELECT') {
            const selector = chooseBestSelector(target);

            const selectedOption = target.options[target.selectedIndex];
            const value = selectedOption?.value || '';
            const text = selectedOption?.text || '';

            sendEvent('select', {
                selector,
                value,
                text,
                label: document.querySelector(`label[for="${target.id}"]`)?.textContent?.trim() || target.name || ''
            });
        }

        // Handle checkboxes
        if (target.type === 'checkbox') {
            sendEvent('checkbox', {
                selector: generateSelector(target),
                checked: target.checked,
                label: document.querySelector(`label[for="${target.id}"]`)?.textContent?.trim() || target.name || ''
            });
        }

        // Handle radio buttons
        if (target.type === 'radio') {
            sendEvent('radio', {
                selector: generateSelector(target),
                value: target.value,
                name: target.name,
                label: document.querySelector(`label[for="${target.id}"]`)?.textContent?.trim() || ''
            });
        }
    }, true);

    // ===== 4. FILE UPLOAD HANDLER =====
    window.addEventListener('change', (e) => {
        const target = e.target;
        if (target.type === 'file') {
            const files = Array.from(target.files || []).map(f => ({
                name: f.name,
                size: f.size,
                type: f.type
            }));

            sendEvent('file_upload', {
                selector: generateSelector(target),
                files,
                label: document.querySelector(`label[for="${target.id}"]`)?.textContent?.trim() || ''
            });
        }
    }, true);

    // ===== 5. DRAG & DROP HANDLER =====
    let draggedElement = null;

    window.addEventListener('dragstart', (e) => {
        draggedElement = e.target;
        dragState = {
            source: generateSelector(e.target),
            sourceText: e.target.textContent?.trim().slice(0, 50) || ''
        };
    }, true);

    window.addEventListener('drop', (e) => {
        if (dragState && e.target !== draggedElement) {
            sendEvent('drag_drop', {
                source: dragState.source,
                sourceText: dragState.sourceText,
                target: generateSelector(e.target),
                targetText: e.target.textContent?.trim().slice(0, 50) || ''
            });
        }
        dragState = null;
        draggedElement = null;
    }, true);

    window.addEventListener('dragend', () => {
        dragState = null;
        draggedElement = null;
    }, true);

    // ===== 6. HOVER HANDLER (with delay to avoid noise) =====
    window.addEventListener('mouseover', (e) => {
        const target = e.target;

        // Skip if hovering over input fields or body
        if (['input', 'textarea', 'select', 'body'].includes(target.tagName.toLowerCase())) {
            return;
        }

        clearTimeout(hoverTimer);

        // Only record if hover lasts > 500ms (intentional hover)
        hoverTimer = setTimeout(() => {
            const selector = chooseBestSelector(target);

            const text = target.textContent?.trim().slice(0, 50) || '';

            // Only record if element has interactive content
            if (text || target.querySelector('a, button')) {
                sendEvent('hover', {
                    selector,
                    text,
                    tagName: target.tagName.toLowerCase()
                });
            }
        }, 500);
    }, true);

    window.addEventListener('mouseout', () => {
        clearTimeout(hoverTimer);
    }, true);

    // ===== 7. RIGHT CLICK / CONTEXT MENU =====
    window.addEventListener('contextmenu', (e) => {
        sendEvent('right_click', {
            selector: generateSelector(e.target),
            text: e.target.textContent?.trim().slice(0, 50) || ''
        });
    }, true);

    // ===== 8. DOUBLE CLICK =====
    window.addEventListener('dblclick', (e) => {
        sendEvent('double_click', {
            selector: generateSelector(e.target),
            text: e.target.textContent?.trim().slice(0, 50) || ''
        });
    }, true);

    // ===== 9. FORM SUBMISSION =====
    let lastFormSubmitTime = 0;
    let lastFormSelector = null;

    window.addEventListener('submit', (e) => {
        const form = e.target;
        const selector = generateSelector(form);
        const now = Date.now();

        if (selector === lastFormSelector && (now - lastFormSubmitTime) < 1000) {
            return;
        }

        lastFormSelector = selector;
        lastFormSubmitTime = now;

        sendEvent('form_submit', {
            action: form.action || '',
            method: (form.method || 'GET').toUpperCase(),
            selector
        });
    }, true);

    // ===== 10. DYNAMIC CONTENT DETECTION =====
    const observePageChanges = () => {
        const observer = new MutationObserver((mutations) => {
            if (!window.__qaRecordingActive) return;
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
                    // Loading states
                    else if (/loading|please wait|processing/i.test(text)) {
                        sendEvent('wait_state', {
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

    // ===== 11. NAVIGATION TRACKING =====
    let lastReportedUrl = null;

    const reportNavigation = () => {
        const url = location.href;

        if (url.includes('cloudflare.com') ||
            url.includes('analytics') ||
            url.includes('tracking') ||
            url.includes('cdn-cgi')) {
            return;
        }

        // Only report if URL actually changed
        if (lastReportedUrl === url) {
            return;
        }

        sendEvent('navigation', {
            href: url,
            title: document.title || '',
            timestamp: Date.now()
        });

        lastReportedUrl = url;
        navigationReported = true;
    };

    if (!navigationReported) {
        setTimeout(reportNavigation, 100);
    }

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

    // ===== 12. FETCH INTERCEPTION =====
    console.log("🌐 Setting up fetch interception...");
    const originalFetch = window.fetch;

    window.fetch = async function (input, init = {}) {
        const startTime = performance.now();
        const url = typeof input === 'string' ? input : input?.url || '';
        const method = init?.method || 'GET';

        console.log("🌐 FETCH INTERCEPTED:", method, url);

        // Skip tracking URLs
        if (url.includes('analytics') ||
            url.includes('tracking') ||
            url.includes('gtm') ||
            url.includes('facebook') ||
            url.includes('google-analytics')) {
            console.log("⏭️ Skipping tracking URL:", url);
            return originalFetch.call(this, input, init);
        }

        try {
            const response = await originalFetch.call(this, input, init);
            const elapsed = Math.round(performance.now() - startTime);

            // Try to capture response preview (first 500 chars)
            let responsePreview = null;
            try {
                const clonedResponse = response.clone();
                const text = await clonedResponse.text();
                responsePreview = text.slice(0, 500);
            } catch (e) {
                // Can't read response body, skip
            }

            const eventData = {
                method,
                url,
                status: response.status,
                timeMs: elapsed,
                timestamp: Date.now(),
                responsePreview
            };

            console.log("✅ FETCH SUCCESS - Posting event:", eventData);
            sendEvent('fetch', eventData);

            return response;
        } catch (error) {
            const elapsed = Math.round(performance.now() - startTime);
            console.log("❌ FETCH ERROR:", error);

            sendEvent('fetch_error', {
                method,
                url,
                timeMs: elapsed,
                error: error.message || String(error)
            });

            throw error;
        }
    };

    // ===== 13. XHR INTERCEPTION =====
    console.log("🌐 Setting up XHR interception...");
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        this._method = method;
        this._url = url;
        console.log("🌐 XHR OPENED:", method, url);
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        const startTime = performance.now();
        const method = this._method;
        const url = this._url;

        this.addEventListener('loadend', () => {
            const elapsed = Math.round(performance.now() - startTime);
            console.log("🌐 XHR COMPLETED:", method, url, "Status:", this.status);

            if (
                url && (
                    url.includes('analytics') ||
                    url.includes('tracking') ||
                    url.includes('gtm') ||
                    url.includes('facebook') ||
                    url.includes('google-analytics')
                )
            ) {
                console.log("⏭️ Skipping tracking URL (XHR):", url);
                return;
            }

            const eventData = {
                method: method || 'GET',
                url: url || '',
                status: this.status,
                timeMs: elapsed,
                timestamp: Date.now()
            };

            console.log("✅ XHR SUCCESS - Posting event:", eventData);
            sendEvent('fetch', eventData);
        });

        return originalSend.apply(this, arguments);
    };

    // ===== 14. SCROLL DETECTION (throttled) =====
    let scrollTimer = null;
    let lastScrollY = window.scrollY;

    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const currentScrollY = window.scrollY;
            const scrollDelta = Math.abs(currentScrollY - lastScrollY);

            // Only record significant scrolls (> 100px)
            if (scrollDelta > 100) {
                sendEvent('scroll', {
                    y: Math.round(currentScrollY),
                    delta: Math.round(scrollDelta),
                    direction: currentScrollY > lastScrollY ? 'down' : 'up'
                });
                lastScrollY = currentScrollY;
            }
        }, 500);
    }, true);

    // ===== 15. KEYBOARD SHORTCUTS =====
    window.addEventListener('keydown', (e) => {
        // Only record meaningful shortcuts (Ctrl/Cmd + key)
        if ((e.ctrlKey || e.metaKey) && e.key && e.key.length === 1) {
            sendEvent('keyboard_shortcut', {
                key: e.key.toUpperCase(),
                ctrl: e.ctrlKey,
                alt: e.altKey,
                shift: e.shiftKey,
                meta: e.metaKey
            });
        }
    }, true);

    // ===== 16. ERROR TRACKING =====
    window.addEventListener('error', (e) => {
        sendEvent('error', {
            message: e.message,
            source: e.filename,
            line: e.lineno,
            column: e.colno
        });
    });

    window.addEventListener('unhandledrejection', (e) => {
        sendEvent('error', {
            message: `Unhandled Promise Rejection: ${e.reason}`,
            source: 'promise',
            line: 0
        });
    });
    // ===== 17. VISUAL REGRESSION DETECTION =====
    // Track element visibility and position changes
    const trackedElements = new Map();

    const observeVisualChanges = () => {
        const observer = new MutationObserver((mutations) => {
            if (!window.__qaRecordingActive) return;

            for (const mutation of mutations) {
                if (mutation.type === 'attributes' &&
                    (mutation.attributeName === 'class' ||
                        mutation.attributeName === 'style')) {

                    const el = mutation.target;
                    const selector = chooseBestSelector(el);

                    // Only track important elements
                    if (el.tagName && ['BUTTON', 'INPUT', 'A', 'DIV'].includes(el.tagName)) {
                        const prevState = trackedElements.get(selector);
                        const newState = {
                            visible: el.offsetParent !== null,
                            classes: el.className,
                            display: window.getComputedStyle(el).display
                        };

                        if (prevState &&
                            (prevState.visible !== newState.visible ||
                                prevState.display !== newState.display)) {

                            sendEvent('visual_change', {
                                selector,
                                from: prevState,
                                to: newState,
                                text: el.textContent?.trim().slice(0, 50) || ''
                            });
                        }

                        trackedElements.set(selector, newState);
                    }
                }
            }
        });

        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeOldValue: true,
                subtree: true
            });
        }
    };

    // Start observing after a delay to avoid initial page load noise
    setTimeout(observeVisualChanges, 2000);
    // Mark as injected
    window.__qaRecorderInjected = true;
    window.__qaRecordingActive = false;

    // Listen for start/stop recording messages from content script
    window.addEventListener('message', (event) => {
        if (event.data.__qaRecorderControl) {
            if (event.data.action === 'startRecording') {
                console.log("🎥 Recording activated");
                window.__qaRecordingActive = true;
                window.__qaSessionId = event.data.sessionId;
            } else if (event.data.action === 'stopRecording') {
                console.log("🛑 Recording stopped");
                window.__qaRecordingActive = false;
            }
        }
    });

    console.log('✅ QA Copilot Injected Script Active (MAIN world)');
    console.log('📹 Fetch interception:', window.fetch !== originalFetch ? '✅ ACTIVE' : '❌ FAILED');
})();