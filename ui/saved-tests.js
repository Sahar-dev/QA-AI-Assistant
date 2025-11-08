// ui/saved-tests.js
import { showToast } from "../core/utils.js";
import { getSync, setSync } from "../core/storage.js";

export async function loadSavedTests() {
  console.log("📦 loadSavedTests called"); // <-- temporary debug
  const container = document.getElementById("saved-tests-container");
  const data = await chrome.storage.local.get("savedTests");
  const tests = data.savedTests || [];

  if (!tests.length) {
    container.innerHTML = `
      <div class="output-empty" style="text-align:center;padding:20px;color:#9ca3af;">
        <i class="fas fa-box-open" style="font-size:22px;margin-bottom:6px;display:block;opacity:0.5;"></i>
        No recorded tests yet.
      </div>`;
    return;
  }

  container.innerHTML = tests
    .map(
      (t, i) => `
        <div class="test-card">
          <div class="test-card-header">
            <div class="test-card-title">${t.testName || "Unnamed Test"}</div>
            <div class="test-card-actions">
              <button class="btn btn-ghost btn-xs copy-btn" data-index="${i}">
                <i class="fas fa-copy"></i>
              </button>
              <button class="btn btn-ghost btn-xs delete-btn" data-index="${i}" style="color:#ef4444;">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="test-card-body">
            <div class="test-card-meta">
              <span><i class="fas fa-code-branch"></i> ${t.framework?.toUpperCase() || "N/A"}</span>
              <span><i class="fas fa-bolt"></i> ${t.eventCount} events</span>
            </div>
            <div class="test-card-desc">${t.testDescription || "No description provided."}</div>
            <div class="test-card-footer">
              <i class="far fa-clock"></i>
              ${new Date(t.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>`
    )
    .join("");

  container.querySelectorAll(".copy-btn").forEach(btn =>
    btn.addEventListener("click", async e => {
      const index = e.currentTarget.dataset.index;
      const code = tests[index].code;
      await navigator.clipboard.writeText(code);
      showToast("✅ Code copied!", "success");
    })
  );

  container.querySelectorAll(".delete-btn").forEach(btn =>
    btn.addEventListener("click", async e => {
      const index = e.currentTarget.dataset.index;
      const updated = [...tests];
      const removed = updated.splice(index, 1);
      await chrome.storage.local.set({ savedTests: updated });
      showToast(`🗑️ Deleted "${removed[0]?.testName}"`, "info");
      loadSavedTests(); // recursive refresh
    })
  );
}
