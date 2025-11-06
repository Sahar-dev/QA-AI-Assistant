// ===== timeline-view.js =====
// Premium timeline UI for QA Copilot with modern light theme

export async function renderTimeline(container) {
    container.innerHTML = `
    <div style="
      color: #94a3b8;
      padding: 40px 20px;
      text-align: center;
      font-size: 14px;
    ">
      <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 12px; display: block;"></i>
      Loading timeline...
    </div>
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

        // --- Build premium HTML UI ---
        let html = "";
        for (const group of grouped) {
            html += `
        <div style="
          margin: 0 0 20px 0;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
          transition: all 0.3s;
        ">
          <div style="
            background: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%);
            color: white;
            padding: 14px 20px;
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
          ">
            <i class="fas fa-globe" style="font-size: 16px;"></i>
            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(group.url)}</span>
          </div>
          <div style="overflow-x: auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#f8f9fe;color:#64748b;text-align:left;">
                  <th style="padding:12px 16px;font-weight:600;border-bottom:1px solid #e2e8f0;">
                    <i class="fas fa-clock" style="margin-right:6px;"></i>Time
                  </th>
                  <th style="padding:12px 16px;font-weight:600;border-bottom:1px solid #e2e8f0;">
                    <i class="fas fa-tag" style="margin-right:6px;"></i>Type
                  </th>
                  <th style="padding:12px 16px;font-weight:600;border-bottom:1px solid #e2e8f0;">
                    <i class="fas fa-info-circle" style="margin-right:6px;"></i>Details
                  </th>
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
            <tr style="
              border-bottom:1px solid #f1f5f9;
              transition: background 0.2s;
            " onmouseover="this.style.background='#f8f9fe'" onmouseout="this.style.background='transparent'">
              <td style="padding:12px 16px;color:#64748b;font-family:'SF Mono','Courier New',monospace;font-size:12px;">
                ${time}
              </td>
              <td style="padding:12px 16px;white-space:nowrap;">
                <span style="
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                  padding: 4px 10px;
                  background: ${meta.bgColor};
                  color: ${meta.color};
                  border-radius: 6px;
                  font-size: 12px;
                  font-weight: 600;
                ">
                  <i class="${meta.icon}"></i>
                  ${e.type}
                </span>
              </td>
              <td style="padding:12px 16px;color:#1e293b;line-height:1.6;">
                ${text}
              </td>
            </tr>
          `;
                })
                .join("");

            html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
        }

        container.innerHTML = html;
        container.scrollTop = container.scrollHeight; // auto-scroll to newest
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

// --- Premium styling helpers ---
function getMeta(type) {
    switch (type) {
        case "click":
            return {
                icon: "fas fa-mouse-pointer",
                color: "#7c3aed",
                bgColor: "rgba(124, 58, 237, 0.1)"
            };
        case "input":
            return {
                icon: "fas fa-keyboard",
                color: "#ec4899",
                bgColor: "rgba(236, 72, 153, 0.1)"
            };
        case "fetch":
        case "xhr":
            return {
                icon: "fas fa-cloud-arrow-down",
                color: "#10b981",
                bgColor: "rgba(16, 185, 129, 0.1)"
            };
        case "scroll":
            return {
                icon: "fas fa-arrows-up-down",
                color: "#06b6d4",
                bgColor: "rgba(6, 182, 212, 0.1)"
            };
        case "navigation":
            return {
                icon: "fas fa-arrow-up-right-from-square",
                color: "#f59e0b",
                bgColor: "rgba(245, 158, 11, 0.1)"
            };
        case "error":
        case "console_error":
            return {
                icon: "fas fa-circle-xmark",
                color: "#ef4444",
                bgColor: "rgba(239, 68, 68, 0.1)"
            };
        default:
            return {
                icon: "fas fa-file-lines",
                color: "#64748b",
                bgColor: "rgba(100, 116, 139, 0.1)"
            };
    }
}

function formatEvent(e) {
    const d = e.data || {};
    switch (e.type) {
        case "click":
            return `Clicked <strong style="color:#7c3aed;">${escapeHtml(d.selector || "")}</strong> <span style="color:#64748b;">"${escapeHtml((d.text || "").slice(0, 50))}"</span>`;
        case "input":
            return `Typed <code style="
              background:#f1f5f9;
              padding:2px 8px;
              border-radius:4px;
              color:#7c3aed;
              font-size:12px;
            ">${escapeHtml(d.value || "")}</code> into <strong style="color:#7c3aed;">${escapeHtml(d.selector || "")}</strong>`;
        case "fetch":
            const statusColor = d.status >= 400 ? "#ef4444" : d.status >= 300 ? "#f59e0b" : "#10b981";
            return `<span style="
              background:#f1f5f9;
              padding:2px 6px;
              border-radius:4px;
              color:#7c3aed;
              font-weight:600;
            ">${escapeHtml(d.method || "GET")}</span> ${escapeHtml(truncate(d.url, 60))} → <span style="color:${statusColor};font-weight:600;">${d.status || ""}</span> <span style="color:#94a3b8;">(${d.timeMs || 0}ms)</span>`;
        case "navigation":
            return `<code style="
              background:#f1f5f9;
              padding:4px 10px;
              border-radius:6px;
              color:#1e293b;
              font-size:12px;
              display:inline-block;
            ">${escapeHtml(truncate(d.href, 80))}</code>`;
        case "error":
        case "console_error":
            return `<span style="
              color:#ef4444;
              display:flex;
              align-items:center;
              gap:6px;
            ">
              <i class="fas fa-triangle-exclamation"></i>
              ${escapeHtml(d.message || "Error logged")}
            </span>`;
        case "scroll":
            return `Scroll position: <code style="
              background:#f1f5f9;
              padding:2px 8px;
              border-radius:4px;
              color:#1e293b;
            ">(${d.x}, ${d.y})</code>`;
        default:
            return `<code style="
              background:#f1f5f9;
              padding:4px 10px;
              border-radius:6px;
              color:#1e293b;
              font-size:11px;
            ">${escapeHtml(JSON.stringify(d))}</code>`;
    }
}

function truncate(str = "", len = 80) {
    return str.length > len ? str.slice(0, len) + "…" : str;
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