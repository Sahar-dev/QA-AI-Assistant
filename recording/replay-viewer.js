// ===== timeline-view.js =====
// Clean grouped timeline UI for QA Copilot

export async function renderTimeline(container) {
    container.innerHTML = `
    <div style="color:#9ca3af;padding:8px;">Loading timeline...</div>
  `;

    try {
        const res = await chrome.runtime.sendMessage({ action: "exportSession" });
        let events = res?.data || [];

        // Filter noisy or duplicate events
        events = events.filter(
            e => !["keydown", "keyup", "raw", "mouse_move"].includes(e.type)
        );

        if (!events.length) {
            container.innerHTML = `
        <div style="color:#9ca3af;padding:8px;">No events recorded in the last 5 minutes.</div>
      `;
            return;
        }

        // --- Group events by page URL (navigation href) ---
        const grouped = [];
        let currentGroup = { url: "Initial Page", events: [] };
        for (const e of events) {
            if (e.type === "navigation" && e.data?.href) {
                if (currentGroup.events.length) grouped.push(currentGroup);
                currentGroup = { url: e.data.href, events: [] };
            } else currentGroup.events.push(e);
        }
        if (currentGroup.events.length) grouped.push(currentGroup);

        // --- Merge consecutive inputs on same element ---
        for (const group of grouped) {
            const merged = [];
            for (const e of group.events) {
                const prev = merged[merged.length - 1];
                if (
                    e.type === "input" &&
                    prev &&
                    prev.type === "input" &&
                    e.data.selector === prev.data.selector
                ) {
                    prev.data.value = e.data.value;
                    prev.t = e.t;
                } else merged.push(e);
            }
            group.events = merged;
        }

        // --- Build modern HTML UI ---
        let html = "";
        for (const group of grouped) {
            html += `
        <div style="
          margin: 10px 0;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          overflow: hidden;
        ">
          <div style="
            background: #1e1e2a;
            color: #a5b4fc;
            padding: 8px 12px;
            font-size: 13px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
          ">
            🌐 ${group.url}
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#111827;color:#9ca3af;text-align:left;">
                <th style="padding:6px 10px;width:90px;">⏰ Time</th>
                <th style="padding:6px 10px;width:90px;">📍 Type</th>
                <th style="padding:6px 10px;">📝 Details</th>
              </tr>
            </thead>
            <tbody>
      `;

            html += group.events
                .slice(-100)
                .map(e => {
                    const meta = getMeta(e.type);
                    const time = new Date(e.t).toLocaleTimeString();
                    const text = formatEvent(e);
                    return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
              <td style="padding:4px 10px;color:#9ca3af;">${time}</td>
              <td style="padding:4px 10px;color:${meta.color};white-space:nowrap;">${meta.icon} ${e.type}</td>
              <td style="padding:4px 10px;color:#e5e7eb;">${text}</td>
            </tr>
          `;
                })
                .join("");

            html += `
            </tbody>
          </table>
        </div>
      `;
        }

        container.innerHTML = html;
        container.scrollTop = container.scrollHeight; // auto-scroll to newest
    } catch (err) {
        console.error("[Timeline] Error:", err);
        container.innerHTML = `<div style="color:red;padding:8px;">Error: ${err.message}</div>`;
    }
}

// --- Styling helpers ---
function getMeta(type) {
    switch (type) {
        case "click": return { icon: "🖱️", color: "#60a5fa" };
        case "input": return { icon: "⌨️", color: "#a78bfa" };
        case "fetch":
        case "xhr": return { icon: "🌐", color: "#34d399" };
        case "scroll": return { icon: "🌀", color: "#38bdf8" };
        case "navigation": return { icon: "🔗", color: "#fbbf24" };
        case "error":
        case "console_error": return { icon: "❌", color: "#f87171" };
        default: return { icon: "📄", color: "#9ca3af" };
    }
}

function formatEvent(e) {
    const d = e.data || {};
    switch (e.type) {
        case "click":
            return `Clicked <strong>${d.selector || ""}</strong> "${(d.text || "").slice(0, 50)}"`;
        case "input":
            return `Typed <code>${d.value || ""}</code> into <strong>${d.selector || ""}</strong>`;
        case "fetch":
            return `${d.method || "GET"} ${truncate(d.url, 60)} → ${d.status || ""} (${d.timeMs || 0}ms)`;
        case "navigation":
            return `<code>${truncate(d.href, 80)}</code>`;
        case "error":
        case "console_error":
            return `<span style="color:#f87171;">${d.message || "Error logged"}</span>`;
        case "scroll":
            return `Scroll position: (${d.x}, ${d.y})`;
        default:
            return JSON.stringify(d);
    }
}

function truncate(str = "", len = 80) {
    return str.length > len ? str.slice(0, len) + "…" : str;
}
