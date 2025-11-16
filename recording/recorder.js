// recording/recorder.js
// Content script bridge - forwards messages between injected script and background
(function () {
    console.log("🌉 Recorder content script (bridge) starting...");

    // Inject the main world script that can intercept fetch
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('recording/recorder-injected.js');
    script.onload = () => {
        console.log("✅ Main world script injected");
        script.remove();
    };
    script.onerror = () => {
        console.error("❌ Failed to inject main world script");
    };
    (document.head || document.documentElement).appendChild(script);

    // Store session ID
    let currentSessionId = null;

    // Listen for events from the injected script (via window.postMessage)
    window.addEventListener('message', (event) => {
        // Only accept messages from same window
        if (event.source !== window) return;

        // Check if it's a recorder event
        if (event.data.__qaRecorderEvent) {
            const { type, data, url, timestamp, sessionId } = event.data;

            // Log ALL events for debugging
            console.log("🌉 Bridge received event:", type, data);

            // Forward to background script
            chrome.runtime.sendMessage({
                action: 'recordEvent',
                payload: {
                    sessionId: sessionId || currentSessionId,
                    type,
                    data,
                    url,
                    timestamp
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('❌ Bridge failed to send to background:', chrome.runtime.lastError);
                } else {
                    console.log(`✅ Bridge sent ${type} event to background:`, response);
                }
            });
        }
    });

    // ALSO listen for custom events (backup method)
    window.addEventListener('__qaRecorderEvent', (event) => {
        const { type, data, url, timestamp, sessionId } = event.detail;

        console.log("🌉 Bridge received event (custom):", type, data);

        chrome.runtime.sendMessage({
            action: 'recordEvent',
            payload: {
                sessionId: sessionId || currentSessionId,
                type,
                data,
                url,
                timestamp
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('❌ Bridge failed to send to background:', chrome.runtime.lastError);
            } else {
                console.log(`✅ Bridge sent ${type} event to background:`, response);
            }
        });
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
        if (req.action === "startRecording") {
            console.log("🎥 Bridge: Starting recording, session:", req.sessionId);
            currentSessionId = req.sessionId; // Store it

            // Forward to injected script via postMessage
            window.postMessage({
                __qaRecorderControl: true,
                action: 'startRecording',
                sessionId: req.sessionId
            }, '*');

            sendResponse({ success: true });
        }

        if (req.action === "stopRecording") {
            console.log("🛑 Bridge: Stopping recording");
            currentSessionId = null; // Clear it

            // Forward to injected script via postMessage
            window.postMessage({
                __qaRecorderControl: true,
                action: 'stopRecording'
            }, '*');

            sendResponse({ success: true });
        }

        return true; // Keep message channel open for async response
    });

    console.log('✅ QA Copilot Content Script Bridge Active');
})();