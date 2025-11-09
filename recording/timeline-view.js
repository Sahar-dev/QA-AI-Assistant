// ===== timeline-view.js =====
// QA Copilot — Premium Timeline Dashboard (collapsible, color-coded, grouped)

export async function renderTimeline(container) {
    container.innerHTML = `
    <div style="
      color: #94a3b8;
      padding: 40px 20px;
      text-align: center;
      font-size: 14px;
    ">
      <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 12px; display: block; color: #7c3aed;"></i>
      Loading timeline...
    </div>
  `;

    try {
        const res = await chrome.runtime.sendMessage({ action: "exportSession" });
        let events = res?.data || [];

        if (!Array.isArray(events) || !events.length) {
            container.innerHTML = `
        <div style="
          color: #94a3b8;
          padding: 60px 20px;
          text-align: center;
          background: #f8f9fe;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        ">
          <i class="fas fa-clock-rotate-left" style="font-size: 48px; margin-bottom: 16px; display: block; color: #cbd5e1;"></i>
          <div style="font-size: 16px; font-weight: 600; color: #64748b; margin-bottom: 8px;">No Events Recorded</div>
          <div style="font-size: 13px;">No events recorded in the last 5 minutes.</div>
        </div>
      `;
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

        // 🖼️ render premium UI
        let html = "";
        for (const g of grouped) {
            const id = `g_${btoa(g.url).replace(/=/g, "")}`;
            const open = JSON.parse(localStorage.getItem(id) || "true");
            html += `
        <div class="timeline-card">
          <div class="timeline-header" onclick="
            const body = document.getElementById('${id}');
            const icon = document.getElementById('${id}_icon');
            body.classList.toggle('collapsed');
            const isOpen = !body.classList.contains('collapsed');
            icon.className = isOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-right';
            localStorage.setItem('${id}', isOpen);
          ">
            <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
              <i class="fas fa-globe" style="font-size:16px;flex-shrink:0;"></i>
              <span class="timeline-url">${escapeHtml(truncate(g.url, 80))}</span>
            </div>
            <i id="${id}_icon" class="fas ${open ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size:14px;"></i>
          </div>
          <div id="${id}" class="timeline-body ${open ? "" : "collapsed"}">
            <table class="timeline-table">
              <thead>
                <tr>
                  <th><i class="fas fa-clock" style="margin-right:6px;"></i>Time</th>
                  <th><i class="fas fa-tag" style="margin-right:6px;"></i>Type</th>
                  <th><i class="fas fa-info-circle" style="margin-right:6px;"></i>Details</th>
                </tr>
              </thead>
              <tbody>
                ${g.events.map(e => renderRow(e)).join("")}
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
        container.innerHTML = `
      <div style="
        color: #ef4444;
        padding: 40px 20px;
        text-align: center;
        background: #fef2f2;
        border-radius: 12px;
        border: 1px solid #fecaca;
      ">
        <i class="fas fa-circle-exclamation" style="font-size: 32px; margin-bottom: 12px; display: block;"></i>
        <div style="font-weight: 600; margin-bottom: 4px;">Error Loading Timeline</div>
        <div style="font-size: 13px;">${escapeHtml(err.message)}</div>
      </div>
    `;
    }
}

// 🔧 row rendering
function renderRow(e) {
    const meta = getMeta(e.type);
    const time = new Date(e.t).toLocaleTimeString();
    const text = formatEvent(e);
    const repeat = e._count ? ` <span style="color:#94a3b8;font-size:11px;">×${e._count}</span>` : "";
    const badge = `<span class="badge" style="background:${meta.badge};color:white;">${meta.label}</span>`;

    return `
    <tr class="timeline-row">
      <td class="time-col">${time}</td>
      <td class="type-col">
        <span class="type-badge" style="background:${meta.bgColor};color:${meta.color};">
          <i class="${meta.icon}"></i>
          ${e.type}${repeat}
        </span>
        ${badge}
      </td>
      <td class="details-col">${text}</td>
    </tr>`;
}

// 🎨 premium style injection
function applyStyles(root) {
    const style = document.createElement("style");
    style.textContent = `
    .timeline-card {
      margin: 0 0 20px 0;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      overflow: hidden;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .timeline-card:hover {
      box-shadow: 0 4px 12px rgba(124, 58, 237, 0.08);
    }
    .timeline-header {
      background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%);
      color: white;
      font-size: 14px;
      font-weight: 600;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
      transition: all 0.2s;
    }
    .timeline-header:hover {
      opacity: 0.95;
    }
    .timeline-url {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .timeline-body {
      transition: max-height 0.3s ease-out;
      overflow: hidden;
    }
    .timeline-body.collapsed {
      display: none;
    }
    .timeline-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .timeline-table th {
      background: #f8f9fe;
      color: #64748b;
      text-align: left;
      padding: 12px 16px;
      font-weight: 600;
      border-bottom: 1px solid #e2e8f0;
    }
    .timeline-table td {
      padding: 12px 16px;
      border-bottom: 1px solid #f1f5f9;
      color: #1e293b;
      vertical-align: top;
    }
    .timeline-row {
      transition: background 0.2s;
    }
    .timeline-row:hover {
      background: #f8f9fe;
    }
    .time-col {
      color: #64748b;
      font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
      font-size: 12px;
      white-space: nowrap;
    }
    .type-col {
      white-space: nowrap;
    }
    .type-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge {
      display: inline-block;
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 12px;
      margin-left: 6px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .details-col {
      line-height: 1.6;
    }
    strong {
      color: #7c3aed;
      font-weight: 600;
    }
    code {
      color: #7c3aed;
      background: #f1f5f9;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
    }
    .status-ok { color: #10b981; font-weight: 600; }
    .status-redirect { color: #f59e0b; font-weight: 600; }
    .status-error { color: #ef4444; font-weight: 600; }
  `;
    root.appendChild(style);
}

// 🧭 metadata with premium colors
function getMeta(t) {
    switch (t) {
        case "click":
            return {
                icon: "fas fa-mouse-pointer",
                color: "#7c3aed",
                bgColor: "rgba(124, 58, 237, 0.1)",
                label: "User",
                badge: "#7c3aed"
            };
        case "input":
            return {
                icon: "fas fa-keyboard",
                color: "#ec4899",
                bgColor: "rgba(236, 72, 153, 0.1)",
                label: "User",
                badge: "#ec4899"
            };
        case "fetch":
        case "xhr":
            return {
                icon: "fas fa-cloud-arrow-down",
                color: "#10b981",
                bgColor: "rgba(16, 185, 129, 0.1)",
                label: "Network",
                badge: "#10b981"
            };
        case "scroll":
            return {
                icon: "fas fa-arrows-up-down",
                color: "#06b6d4",
                bgColor: "rgba(6, 182, 212, 0.1)",
                label: "User",
                badge: "#06b6d4"
            };
        case "navigation":
            return {
                icon: "fas fa-arrow-up-right-from-square",
                color: "#f59e0b",
                bgColor: "rgba(245, 158, 11, 0.1)",
                label: "Nav",
                badge: "#f59e0b"
            };
        case "error":
        case "console_error":
            return {
                icon: "fas fa-circle-xmark",
                color: "#ef4444",
                bgColor: "rgba(239, 68, 68, 0.1)",
                label: "Error",
                badge: "#ef4444"
            };
        default:
            return {
                icon: "fas fa-file-lines",
                color: "#64748b",
                bgColor: "rgba(100, 116, 139, 0.1)",
                label: "System",
                badge: "#64748b"
            };
    }
}

// 🧱 format event details with premium styling
function formatEvent(e) {
    const d = e.data || {};
    switch (e.type) {
        case "click":
            return `Clicked <strong>${escapeHtml(d.selector || "")}</strong> <span style="color:#64748b;">"${escapeHtml((d.text || "").slice(0, 40))}"</span>`;
        case "input":
            return `Typed <code>${escapeHtml(d.value || "")}</code> into <strong>${escapeHtml(d.selector || "")}</strong>`;
        case "fetch":
            const statusClass = d.status >= 400 ? "status-error" : d.status >= 300 ? "status-redirect" : "status-ok";
            return `<span style="background:#f1f5f9;padding:2px 6px;border-radius:4px;color:#7c3aed;font-weight:600;">${escapeHtml(d.method || "GET")}</span> ${escapeHtml(truncate(d.url, 60))} → <span class="${statusClass}">${d.status || ""}</span> <span style="color:#94a3b8;">(${d.timeMs || 0}ms)</span>`;
        case "navigation":
            return `<code style="display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(truncate(d.href, 80))}</code>`;
        case "error":
        case "console_error":
            return `<span style="color:#ef4444;display:flex;align-items:center;gap:6px;"><i class="fas fa-triangle-exclamation"></i>${escapeHtml(d.message || "Error logged")}</span>`;
        case "scroll":
            return `Scroll position: <code>(${d.x}, ${d.y})</code>`;
        default:
            return "";
    }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function truncate(s = "", n = 80) {
    return s.length > n ? s.slice(0, n) + "…" : s;
}