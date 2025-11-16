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
    const MAX_HISTORY = 200;
    const MAX_PERF_SAMPLES = 150;

    window.__qaConsoleHistory = window.__qaConsoleHistory || [];
    window.__qaNetworkLog = window.__qaNetworkLog || [];
    window.__qaRuntimeErrors = window.__qaRuntimeErrors || [];
    window.__qaPerfStats = window.__qaPerfStats || { memory: [], longTasks: [] };
    window.__qaClickIssues = window.__qaClickIssues || [];
    window.__qaRecordingMode = window.__qaRecordingMode || "test";
    window.__qaModeSettings = window.__qaModeSettings || {};

    const listenerWrapMap = new WeakMap();
    const handlerWrapMap = new WeakMap();
    const recentEventCache = new Map();
    const flowCounts = new Map();

    function digestString(value = "") {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = (hash << 5) - hash + value.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString();
    }

    function pushBounded(array, entry, max = MAX_HISTORY) {
        array.push(entry);
        if (array.length > max) array.shift();
    }

    function mode() {
        return window.__qaRecordingMode || "test";
    }

    function isBugMode() {
        return mode() === "bug";
    }

    function isExploratoryMode() {
        return mode() === "explore";
    }

    function getModeSetting(key, fallback) {
        const settings = window.__qaModeSettings || {};
        return settings[key] !== undefined ? settings[key] : fallback;
    }

    function shouldRecordEvent(type, payload = {}) {
        const current = mode();
        if (current === "test" || isBugMode()) return true;
        const allowed = new Set(["click", "input", "select", "form_submit", "navigation", "hover", "modal", "flow_marker", "error", "slow_fetch", "assertion", "wait_state", "right_click", "double_click"]);
        if (!allowed.has(type)) return false;
        const signature = `${type}:${payload.selector || payload.href || payload.text || payload.label || ""}`.slice(0, 200);
        const now = Date.now();
        const last = recentEventCache.get(signature);
        if (last && now - last < 1500) return false;
        recentEventCache.set(signature, now);
        if (recentEventCache.size > 400) {
            const keys = Array.from(recentEventCache.keys()).slice(0, 50);
            keys.forEach((key) => recentEventCache.delete(key));
        }
        return true;
    }

    function detectFlow(type, payload = {}) {
        const url = (payload.href || location.pathname || "").toLowerCase();
        const text = (payload.text || payload.label || "").toLowerCase();
        if (url.includes("login") || text.includes("login")) return "Login flow";
        if (url.includes("checkout") || text.includes("checkout") || text.includes("payment")) return "Checkout";
        if (url.includes("pricing") || text.includes("pricing")) return "Pricing exploration";
        if (url.includes("settings") || text.includes("settings")) return "Settings";
        if (type === "form_submit") return "Form submission";
        return null;
    }

    function emitFlowMarker(type, payload) {
        if (!isExploratoryMode()) return;
        const flow = detectFlow(type, payload);
        if (!flow) return;
        const count = (flowCounts.get(flow) || 0) + 1;
        flowCounts.set(flow, count);
        sendEvent("flow_marker", {
            flow,
            count,
            type,
            text: payload.text || payload.label || "",
            selector: payload.selector || "",
            url: location.href,
        });
    }

    function recordConsoleEntry(level, args = []) {
        const message = args
            .map((arg) => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg);
                    } catch {
                        return '[object]';
                    }
                }
                return String(arg);
            })
            .join(' ')
            .slice(0, 500);

        pushBounded(window.__qaConsoleHistory, {
            level,
            message,
            timestamp: Date.now(),
            digest: digestString(level + ":" + message),
        });
    }

    function recordNetworkEntry(entry = {}) {
        pushBounded(window.__qaNetworkLog, {
            ...entry,
            timestamp: entry.timestamp || Date.now(),
            digest: digestString(`${entry.method || 'GET'}:${entry.url || ''}:${entry.status || ''}`),
        });
    }

    function recordRuntimeError(payload = {}) {
        pushBounded(window.__qaRuntimeErrors, {
            ...payload,
            timestamp: Date.now(),
        });
        if (window.__qaRecordingActive && isBugMode()) {
            sendEvent('bug_signal', {
                kind: 'runtime_error',
                message: payload.message,
                source: payload.source,
                line: payload.line,
                column: payload.column,
            });
        }
    }

    function recordClickIssue(target, err, phase = "listener") {
        const descriptor = target?.outerHTML
            ? target.outerHTML.slice(0, 200)
            : target?.tagName || "unknown";
        pushBounded(window.__qaClickIssues, {
            selector: descriptor,
            message: err?.message || String(err),
            phase,
            timestamp: Date.now(),
        });
        if (window.__qaRecordingActive && isBugMode()) {
            sendEvent('bug_signal', {
                kind: 'click_failure',
                selector: descriptor,
                message: err?.message || String(err),
                phase,
            });
        }
    }

    if (!window.__qaConsolePatched) {
        window.__qaConsolePatched = true;
        ["log", "info", "warn", "error"].forEach((level) => {
            const original = console[level];
            console[level] = function (...args) {
                try {
                    recordConsoleEntry(level, args);
                } catch { /* noop */ }
                return original.apply(this, args);
            };
        });
    }

    // Send events to content script via window.postMessage
    const sendEvent = (type, data = {}) => {
        const message = {
            __qaRecorderEvent: true,
            type,
            data,
            url: location.href,
            timestamp: Date.now(),
            sessionId: window.__qaSessionId, // Include session ID
            mode: window.__qaRecordingMode || "test",
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

    // Wrap click listeners to capture thrown errors
    if (!window.__qaClickPatched) {
        window.__qaClickPatched = true;
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (type === 'click' && typeof listener === 'function') {
                if (listenerWrapMap.has(listener)) {
                    return originalAddEventListener.call(this, type, listenerWrapMap.get(listener), options);
                }
                const wrapped = function (...args) {
                    try {
                        return listener.apply(this, args);
                    } catch (err) {
                        recordClickIssue(this, err, "listener");
                        throw err;
                    }
                };
                listenerWrapMap.set(listener, wrapped);
                return originalAddEventListener.call(this, type, wrapped, options);
            }

            if (type === 'click' && listener && typeof listener === 'object' && typeof listener.handleEvent === 'function') {
                if (handlerWrapMap.has(listener)) {
                    return originalAddEventListener.call(this, type, handlerWrapMap.get(listener), options);
                }
                const wrappedObj = {
                    handleEvent(event) {
                        try {
                            return listener.handleEvent.call(this, event);
                        } catch (err) {
                            recordClickIssue(this, err, "listener");
                            throw err;
                        }
                    }
                };
                handlerWrapMap.set(listener, wrappedObj);
                return originalAddEventListener.call(this, type, wrappedObj, options);
            }

            return originalAddEventListener.call(this, type, listener, options);
        };

        EventTarget.prototype.removeEventListener = function (type, listener, options) {
            if (type === 'click' && listenerWrapMap.has(listener)) {
                const wrapped = listenerWrapMap.get(listener);
                listenerWrapMap.delete(listener);
                return originalRemoveEventListener.call(this, type, wrapped, options);
            }
            if (type === 'click' && handlerWrapMap.has(listener)) {
                const wrapped = handlerWrapMap.get(listener);
                handlerWrapMap.delete(listener);
                return originalRemoveEventListener.call(this, type, wrapped, options);
            }
            return originalRemoveEventListener.call(this, type, listener, options);
        };

        const originalClick = HTMLElement.prototype.click;
        HTMLElement.prototype.click = function () {
            try {
                return originalClick.apply(this, arguments);
            } catch (err) {
                recordClickIssue(this, err, "direct-click");
                throw err;
            }
        };
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

        const payload = {
            selector,
            text,
            tagName,
            actionType,
            href: target.href || null
        };

        if (!shouldRecordEvent('click', payload)) return;

        sendEvent('click', payload);
        emitFlowMarker('click', payload);
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

            const payload = {
                selector,
                kind: fieldType,
                value,
                placeholder: target.placeholder || '',
                label: labelText,
                name: target.name || target.id || ''
            };

            if (!shouldRecordEvent('input', payload)) return;

            sendEvent('input', payload);

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

            const payload = {
                selector,
                value,
                text,
                label: document.querySelector(`label[for="${target.id}"]`)?.textContent?.trim() || target.name || ''
            };

            if (shouldRecordEvent('select', payload)) {
                sendEvent('select', payload);
            }
        }

        // Handle checkboxes
        if (target.type === 'checkbox') {
            const payload = {
                selector: generateSelector(target),
                checked: target.checked,
                label: document.querySelector(`label[for="${target.id}"]`)?.textContent?.trim() || target.name || ''
            };
            if (shouldRecordEvent('checkbox', payload)) {
                sendEvent('checkbox', payload);
            }
        }

        // Handle radio buttons
        if (target.type === 'radio') {
            const payload = {
                selector: generateSelector(target),
                value: target.value,
                name: target.name,
                label: document.querySelector(`label[for="${target.id}"]`)?.textContent?.trim() || ''
            };
            if (shouldRecordEvent('radio', payload)) {
                sendEvent('radio', payload);
            }
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

            const payload = {
                selector: generateSelector(target),
                files,
                label: document.querySelector(`label[for="${target.id}"]`)?.textContent?.trim() || ''
            };
            if (shouldRecordEvent('file_upload', payload)) {
                sendEvent('file_upload', payload);
            }
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
            const payload = {
                source: dragState.source,
                sourceText: dragState.sourceText,
                target: generateSelector(e.target),
                targetText: e.target.textContent?.trim().slice(0, 50) || ''
            };
            if (shouldRecordEvent('drag_drop', payload)) {
                sendEvent('drag_drop', payload);
            }
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
                const payload = {
                    selector,
                    text,
                    tagName: target.tagName.toLowerCase()
                };
                if (shouldRecordEvent('hover', payload)) {
                    sendEvent('hover', payload);
                }
            }
        }, 500);
    }, true);

    window.addEventListener('mouseout', () => {
        clearTimeout(hoverTimer);
    }, true);

    // ===== 7. RIGHT CLICK / CONTEXT MENU =====
    window.addEventListener('contextmenu', (e) => {
        const payload = {
            selector: generateSelector(e.target),
            text: e.target.textContent?.trim().slice(0, 50) || ''
        };
        if (shouldRecordEvent('right_click', payload)) {
            sendEvent('right_click', payload);
        }
    }, true);

    // ===== 8. DOUBLE CLICK =====
    window.addEventListener('dblclick', (e) => {
        const payload = {
            selector: generateSelector(e.target),
            text: e.target.textContent?.trim().slice(0, 50) || ''
        };
        if (shouldRecordEvent('double_click', payload)) {
            sendEvent('double_click', payload);
        }
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

        const payload = {
            action: form.action || '',
            method: (form.method || 'GET').toUpperCase(),
            selector
        };
        if (!shouldRecordEvent('form_submit', payload)) return;
        sendEvent('form_submit', payload);
        emitFlowMarker('form_submit', payload);
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
                        const payload = {
                            type: 'success_message',
                            text,
                            selector: generateSelector(node)
                        };
                        if (shouldRecordEvent('assertion', payload)) {
                            sendEvent('assertion', payload);
                        }
                    }
                    // Error messages
                    else if (/error|failed|invalid|incorrect|unauthorized|denied|wrong/i.test(text)) {
                        const payload = {
                            type: 'error_message',
                            text,
                            selector: generateSelector(node)
                        };
                        if (shouldRecordEvent('assertion', payload)) {
                            sendEvent('assertion', payload);
                        }
                    }
                    // Loading states
                    else if (/loading|please wait|processing/i.test(text)) {
                        const payload = {
                            text,
                            selector: generateSelector(node)
                        };
                        if (shouldRecordEvent('wait_state', payload)) {
                            sendEvent('wait_state', payload);
                        }
                    }

                    if (node.matches && (node.matches('[role="dialog"], dialog, .modal') || node.getAttribute('aria-modal') === 'true')) {
                        const payload = {
                            selector: generateSelector(node),
                            text: node.textContent?.trim().slice(0, 80) || '',
                            state: 'opened',
                        };
                        if (shouldRecordEvent('modal', payload)) {
                            sendEvent('modal', payload);
                        }
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

        const payload = {
            href: url,
            title: document.title || '',
            timestamp: Date.now()
        };
        if (shouldRecordEvent('navigation', payload)) {
            sendEvent('navigation', payload);
            emitFlowMarker('navigation', payload);
        }

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

    // ===== PERFORMANCE & MEMORY MONITORING =====
    (function setupPerformanceMonitors() {
        if (window.__qaPerfObserversReady) return;
        window.__qaPerfObserversReady = true;

        if ('PerformanceObserver' in window && typeof PerformanceObserver === 'function') {
            try {
                const longTaskObserver = new PerformanceObserver((list) => {
                    list.getEntries().forEach((entry) => {
                        pushBounded(window.__qaPerfStats.longTasks, {
                            duration: entry.duration,
                            startTime: entry.startTime,
                            timestamp: Date.now(),
                        }, MAX_PERF_SAMPLES);
                        if (window.__qaRecordingActive && isBugMode()) {
                            sendEvent('perf_longtask', {
                                duration: entry.duration,
                                startTime: entry.startTime,
                            });
                        }
                    });
                });
                longTaskObserver.observe({ entryTypes: ['longtask'] });
            } catch (err) {
                console.warn("Unable to observe long tasks", err);
            }

            try {
                const layoutShiftObserver = new PerformanceObserver((list) => {
                    if (!window.__qaRecordingActive || !isBugMode()) return;
                    list.getEntries().forEach((entry) => {
                        if (entry.hadRecentInput) return;
                        sendEvent('layout_shift', {
                            value: entry.value,
                            sources: (entry.sources || [])
                                .map((source) => source.node?.tagName || "unknown")
                                .slice(0, 3),
                        });
                    });
                });
                layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
            } catch (err) {
                console.warn("Unable to observe layout shifts", err);
            }
        }

        if (performance && performance.memory) {
            let lastHeapSample = null;
            setInterval(() => {
                const sample = {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    timestamp: Date.now(),
                };
                pushBounded(window.__qaPerfStats.memory, sample, MAX_PERF_SAMPLES);
                if (window.__qaRecordingActive && isBugMode() && lastHeapSample) {
                    const delta = sample.usedJSHeapSize - lastHeapSample.usedJSHeapSize;
                    if (delta > 5 * 1024 * 1024) {
                        sendEvent('bug_signal', {
                            kind: 'memory_spike',
                            delta,
                        });
                    }
                }
                lastHeapSample = sample;
            }, 5000);
        }
    })();

    (function monitorFps() {
        let lastFrame = performance.now();
        function frame(now) {
            const delta = now - lastFrame;
            if (window.__qaRecordingActive && isBugMode() && delta > 250) {
                sendEvent('fps_drop', { delta });
            }
            lastFrame = now;
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    })();

    // ===== 12. FETCH INTERCEPTION =====
    console.log("🌐 Setting up fetch interception...");
    const originalFetch = window.fetch;

    window.fetch = async function (input, init = {}) {
        if (!window.__qaRecordingActive) {
            return originalFetch.call(this, input, init);
        }
        const startTime = performance.now();
        const url = typeof input === 'string' ? input : input?.url || '';
        const method = init?.method || 'GET';
        const capturePayloads = isBugMode() && getModeSetting('capturePayloads', true);
        const slowThreshold = getModeSetting('slowThreshold', isBugMode() ? 500 : 800);

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

        let requestSnippet = null;
        if (capturePayloads && init?.body && typeof init.body === 'string') {
            requestSnippet = init.body.slice(0, 1000);
        }

        try {
            const response = await originalFetch.call(this, input, init);
            const elapsed = Math.round(performance.now() - startTime);

            // Try to capture response preview (first 500 chars)
            let responsePreview = null;
            if (capturePayloads) {
                try {
                    const clonedResponse = response.clone();
                    const text = await clonedResponse.text();
                    responsePreview = text.slice(0, 1000);
                } catch (e) {
                    // Can't read response body, skip
                }
            }

            const eventData = {
                method,
                url,
                status: response.status,
                timeMs: elapsed,
                timestamp: Date.now(),
                responsePreview,
                requestPreview: requestSnippet,
            };

            recordNetworkEntry({ channel: 'fetch', ...eventData });

            const shouldEmitFetch =
                mode() !== "explore" ||
                response.status >= 400 ||
                elapsed > slowThreshold;

            if (shouldEmitFetch) {
                sendEvent('fetch', eventData);
            }

            if ((isBugMode() || isExploratoryMode()) && elapsed > slowThreshold) {
                sendEvent('slow_fetch', {
                    method,
                    url,
                    status: response.status,
                    timeMs: elapsed,
                });
            }

            if (isBugMode() && response.status >= 400) {
                sendEvent('bug_signal', {
                    kind: 'api_failure',
                    method,
                    url,
                    status: response.status,
                });
            }

            return response;
        } catch (error) {
            const elapsed = Math.round(performance.now() - startTime);
            console.log("❌ FETCH ERROR:", error);

            const errorData = {
                method,
                url,
                timeMs: elapsed,
                error: error.message || String(error),
                requestPreview: requestSnippet,
            };

            recordNetworkEntry({ channel: 'fetch', status: 'error', ...errorData });
            sendEvent('fetch_error', errorData);

            if (isBugMode()) {
                sendEvent('bug_signal', {
                    kind: 'api_exception',
                    method,
                    url,
                    message: error.message || String(error),
                });
            }

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
        if (!window.__qaRecordingActive) {
            return originalSend.apply(this, arguments);
        }
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

            recordNetworkEntry({ channel: 'xhr', ...eventData });
            const slowThreshold = getModeSetting('slowThreshold', isBugMode() ? 500 : 800);
            const shouldEmit =
                mode() !== "explore" ||
                (this.status >= 400) ||
                elapsed > slowThreshold;

            if (shouldEmit) {
                sendEvent('fetch', eventData);
            }

            if ((isBugMode() || isExploratoryMode()) && elapsed > slowThreshold) {
                sendEvent('slow_fetch', {
                    method: method || 'GET',
                    url: url || '',
                    status: this.status,
                    timeMs: elapsed,
                });
            }

            if (isBugMode() && this.status >= 400) {
                sendEvent('bug_signal', {
                    kind: 'api_failure',
                    method: method || 'GET',
                    url: url || '',
                    status: this.status,
                });
            }
        });

        this.addEventListener('error', () => {
            const elapsed = Math.round(performance.now() - startTime);
            const errorData = {
                method: method || 'GET',
                url: url || '',
                timeMs: elapsed,
                error: 'XHR error',
            };
            recordNetworkEntry({ channel: 'xhr', status: 'error', ...errorData });
            sendEvent('fetch_error', errorData);
            if (isBugMode()) {
                sendEvent('bug_signal', {
                    kind: 'api_exception',
                    method: method || 'GET',
                    url: url || '',
                    message: 'XHR error',
                });
            }
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
                const payload = {
                    y: Math.round(currentScrollY),
                    delta: Math.round(scrollDelta),
                    direction: currentScrollY > lastScrollY ? 'down' : 'up'
                };
                if (shouldRecordEvent('scroll', payload)) {
                    sendEvent('scroll', payload);
                }
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
        recordRuntimeError({
            message: e.message,
            source: e.filename,
            line: e.lineno,
            column: e.colno,
        });
        const payload = {
            message: e.message,
            source: e.filename,
            line: e.lineno,
            column: e.colno
        };
        if (shouldRecordEvent('error', payload)) {
            sendEvent('error', payload);
        }
    });

    window.addEventListener('unhandledrejection', (e) => {
        recordRuntimeError({
            message: `Unhandled Promise Rejection: ${e.reason}`,
            source: 'promise',
            line: 0,
        });
        const payload = {
            message: `Unhandled Promise Rejection: ${e.reason}`,
            source: 'promise',
            line: 0
        };
        if (shouldRecordEvent('error', payload)) {
            sendEvent('error', payload);
        }
    });
    // ===== 17. VISUAL REGRESSION DETECTION =====
    // Track element visibility and position changes
    const trackedElements = new Map();
    const flapMap = new Map();

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
                            if (window.__qaRecordingActive && isBugMode()) {
                                const now = Date.now();
                                const entry = flapMap.get(selector) || { count: 0, timestamp: now };
                                if (now - entry.timestamp < 2000) {
                                    entry.count += 1;
                                } else {
                                    entry.count = 1;
                                }
                                entry.timestamp = now;
                                flapMap.set(selector, entry);
                                if (entry.count >= 3) {
                                    sendEvent('bug_signal', {
                                        kind: 'flapping_ui',
                                        selector,
                                        text: el.textContent?.trim().slice(0, 50) || ''
                                    });
                                    entry.count = 0;
                                }
                            }
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
                console.log("🎥 Recording activated (mode:", event.data.mode || "test", ")");
                window.__qaRecordingActive = true;
                window.__qaSessionId = event.data.sessionId;
                window.__qaRecordingMode = event.data.mode || "test";
                window.__qaModeSettings = event.data.modeSettings || {};
                recentEventCache.clear();
                flowCounts.clear();
            } else if (event.data.action === 'stopRecording') {
                console.log("🛑 Recording stopped");
                window.__qaRecordingActive = false;
            }
        }
    });

    console.log('✅ QA Copilot Injected Script Active (MAIN world)');
    console.log('📹 Fetch interception:', window.fetch !== originalFetch ? '✅ ACTIVE' : '❌ FAILED');
})();
