// ===== timeline-view.js =====
// QA Copilot — Polished Timeline Dashboard (color-coded, grouped, collapsible)

export async function renderTimeline(container) {
    container.innerHTML = `<div style="color:#9ca3af;padding:8px;">Loading timeline...</div>`;

    try {
        const res = await chrome.runtime.sendMessage({ action: "exportSession" });
        let events = res?.data || [];

        if (!Array.isArray(events) || !events.length) {
            container.innerHTML = `<div style="color:#9ca3af;padding:8px;">No events recorded in the last 5 minutes.</div>`;
            return;
        }

        // 🧹 filter noise
        events = events.filter(
            e =>
                e &&
                e.type &&
                !["keydown", "keyup", "keypress", "mouse_move", "scroll", "heartbeat"].includes(e.type)
        );

        // 🧩 group by navigation
        const grouped = [];
        let current = { url: "Initial Page", events: [] };
        for (const e of events) {
            if (e.type === "navigation" && e.data?.href) {
                if (current.events.length) grouped.push(current);
                current = { url: e.data.href, events: [] };
            } else current.events.push(e);
        }
        if (current.events.length) grouped.push(current);

        // 🪄 merge duplicates / inputs
        for (const g of grouped) {
            const merged = [];
            for (const e of g.events) {
                const last = merged[merged.length - 1];
                const sameClick =
                    e.type === "click" &&
                    last &&
                    last.type === "click" &&
                    e.data.selector === last.data.selector &&
                    e.t - last.t < 1000;
                if (sameClick) last._count = (last._count || 1) + 1;
                else if (
                    e.type === "input" &&
                    last &&
                    last.type === "input" &&
                    e.data.selector === last.data.selector
                ) {
                    last.data.value = e.data.value;
                    last.t = e.t;
                } else merged.push(e);
            }
            g.events = merged;
        }

        // 🖼️ render
        let html = "";
        for (const g of grouped) {
            const id = `g_${btoa(g.url).replace(/=/g, "")}`;
            const open = JSON.parse(localStorage.getItem(id) || "true");
            html += `
        <div class="timeline-card">
          <div class="timeline-header" onclick="const b=document.getElementById('${id}');
            b.classList.toggle('collapsed');
            localStorage.setItem('${id}', !b.classList.contains('collapsed'));">
            <span class="timeline-url">🌐 ${truncate(g.url, 80)}</span>
            <span class="timeline-toggle">${open ? "▼" : "▶"}</span>
          </div>
          <div id="${id}" class="timeline-body ${open ? "" : "collapsed"}">
            <table class="timeline-table">
              <thead>
                <tr>
                  <th>⏰ Time</th>
                  <th>📍 Type</th>
                  <th>📝 Details</th>
                </tr>
              </thead>
              <tbody>
                ${g.events
                    .map(e => renderRow(e))
                    .join("")}
              </tbody>
            </table>
          </div>
        </div>`;
        }

        container.innerHTML = html;
        applyStyles(container);
        container.scrollTop = container.scrollHeight;
    } catch (err) {
        console.error("[Timeline] Error:", err);
        container.innerHTML = `<div style="color:red;padding:8px;">${err.message}</div>`;
    }
}

// 🔧 row rendering
function renderRow(e) {
    const meta = getMeta(e.type);
    const time = new Date(e.t).toLocaleTimeString();
    const text = formatEvent(e);
    const repeat = e._count ? ` ×${e._count}` : "";
    const badge = `<span class="badge" style="background:${meta.badge};">${meta.label}</span>`;
    return `
    <tr>
      <td>${time}</td>
      <td style="color:${meta.color}">${meta.icon} ${e.type}${repeat} ${badge}</td>
      <td>${text}</td>
    </tr>`;
}

// 🎨 dynamic style injection
function applyStyles(root) {
    const style = document.createElement("style");
    style.textContent = `
    .timeline-card {
      margin:8px 0;
      border:1px solid rgba(255,255,255,0.1);
      border-radius:10px;
      overflow:hidden;
      background:rgba(255,255,255,0.03);
      box-shadow:0 2px 6px rgba(0,0,0,0.25);
    }
    .timeline-header {
      background:#1e1e2a;
      color:#a5b4fc;
      font-size:13px;
      padding:8px 12px;
      display:flex;
      justify-content:space-between;
      align-items:center;
      cursor:pointer;
    }
    .timeline-body.collapsed { display:none; }
    .timeline-table {
      width:100%;
      border-collapse:collapse;
      font-size:13px;
    }
    .timeline-table th {
      background:#111827;
      color:#9ca3af;
      text-align:left;
      padding:6px 10px;
      border-bottom:1px solid rgba(255,255,255,0.1);
    }
    .timeline-table td {
      padding:5px 10px;
      border-bottom:1px solid rgba(255,255,255,0.05);
      color:#e5e7eb;
      vertical-align:top;
    }
    .timeline-table tr:nth-child(even) {
      background:rgba(255,255,255,0.02);
    }
    .badge {
      color:#fff;
      font-size:10px;
      padding:2px 6px;
      border-radius:6px;
      margin-left:6px;
    }
    strong { color:#a5b4fc; }
    code {
      color:#f9a8d4;
      background:rgba(255,255,255,0.05);
      padding:1px 4px;
      border-radius:4px;
    }
  `;
    root.appendChild(style);
}

// 🧭 metadata, color, badge
function getMeta(t) {
    switch (t) {
        case "click": return { icon: "🖱️", color: "#60a5fa", label: "User", badge: "#22c55e" };
        case "input": return { icon: "⌨️", color: "#a78bfa", label: "User", badge: "#22c55e" };
        case "fetch":
        case "xhr": return { icon: "🌐", color: "#34d399", label: "Network", badge: "#6366f1" };
        case "scroll": return { icon: "🌀", color: "#38bdf8", label: "User", badge: "#22c55e" };
        case "navigation": return { icon: "🔗", color: "#fbbf24", label: "Navigation", badge: "#facc15" };
        case "error":
        case "console_error": return { icon: "❌", color: "#f87171", label: "Error", badge: "#ef4444" };
        default: return { icon: "📄", color: "#9ca3af", label: "System", badge: "#6b7280" };
    }
}

// 🧱 format event details
function formatEvent(e) {
    const d = e.data || {};
    switch (e.type) {
        case "click": return `Clicked <strong>${d.selector || ""}</strong> "${(d.text || "").slice(0, 40)}"`;
        case "input": return `Typed <code>${sanitize(d.value) || ""}</code> into <strong>${d.selector || ""}</strong>`;
        case "fetch": return `${d.method || "GET"} ${truncate(d.url, 60)} → ${d.status || ""} (${d.timeMs || 0} ms)`;
        case "navigation": return `<code>${truncate(d.href, 80)}</code>`;
        case "error":
        case "console_error": return `<span style="color:#f87171;">${d.message || "Error logged"}</span>`;
        case "scroll": return `Scroll (${d.x}, ${d.y})`;
        default: return "";
    }
}

function sanitize(s = "") { return s.replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function truncate(s = "", n = 80) { return s.length > n ? s.slice(0, n) + "…" : s; }
