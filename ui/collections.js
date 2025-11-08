import { showToast } from "../core/utils.js";
import { getSync, setSync } from "../core/storage.js";
export async function setupCollections() {
    const list = document.getElementById('collections-list');
    const input = document.getElementById('new-collection-name');
    const addBtn = document.getElementById('add-collection-btn');

    const modal = document.getElementById('collection-modal');
    const modalTitle = document.getElementById('collection-modal-title');
    const modalBody = document.getElementById('collection-tests-list');
    const exportBtn = document.getElementById('export-collection-btn');
    const clearBtn = document.getElementById('clear-collection-btn');
    const closeModal = document.getElementById('close-collection-modal');

    // ====== Render all collections ======
    async function renderCollections() {
        const data = await chrome.storage.local.get(['collections', 'activeCollection']);
        const collections = data.collections || [];
        const active = data.activeCollection;

        if (!collections.length) {
            list.innerHTML = `<div class="output-empty">No collections yet.</div>`;
            return;
        }

        list.innerHTML = collections.map(c => `
  <div class="collection-item ${active === c.id ? 'active' : ''}" data-id="${c.id}">
    <div class="collection-item-header">
      <div class="collection-item-title">${c.name}</div>
      <div class="collection-item-actions">
        <button class="view-collection" data-id="${c.id}" title="View tests">
          <i class="fas fa-eye" style="color:#475569;"></i>
        </button>
        <button class="delete-collection" data-id="${c.id}" title="Delete">
          <i class="fas fa-trash" style="color:#dc2626;"></i>
        </button>
      </div>
    </div>
    <div class="collection-item-meta">${(c.tests || []).length} tests</div>
  </div>
`).join('');
    }

    // ====== Add new collection ======
    addBtn?.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) return showToast('Enter a name first', 'error');

        const id = name.toLowerCase().replace(/\s+/g, '-');
        const data = await chrome.storage.local.get('collections');
        const collections = data.collections || [];

        if (collections.some(c => c.id === id)) {
            showToast('Collection already exists', 'error');
            return;
        }

        collections.push({ id, name, tests: [] });
        await chrome.storage.local.set({ collections, activeCollection: id });
        input.value = '';
        showToast(`🗂️ Collection "${name}" added`, 'success');
        renderCollections();
    });

    // ====== Handle clicks inside collection list ======
    list?.addEventListener('click', async (e) => {
        const viewBtn = e.target.closest('.view-collection');
        const deleteBtn = e.target.closest('.delete-collection');
        const item = e.target.closest('.collection-item');
        if (!item) return;

        const id = viewBtn?.dataset.id || deleteBtn?.dataset.id || item.dataset.id;
        if (!id) return;

        const data = await chrome.storage.local.get('collections');
        const collections = data.collections || [];
        const collection = collections.find(c => c.id === id);
        if (!collection) return;

        // Delete collection
        if (deleteBtn) {
            if (confirm(`Delete collection "${collection.name}"?`)) {
                const updated = collections.filter(c => c.id !== id);
                await chrome.storage.local.set({ collections: updated });
                showToast(`🗑️ Deleted "${collection.name}"`, 'info');
                renderCollections();
            }
            return;
        }

        // Select active collection
        await chrome.storage.local.set({ activeCollection: id });
        showToast(`📁 Active collection set: ${collection.name}`, 'info');
        renderCollections();

        // View collection in modal
        if (viewBtn) {
            modal.classList.remove('hidden');
            modalTitle.textContent = `Collection: ${collection.name}`;

            if (!collection.tests?.length) {
                modalBody.innerHTML = `<div style="color:#666;">No tests yet in this collection.</div>`;
            } else {
                modalBody.innerHTML = collection.tests.map(t => `
          <div style="border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:6px;">
            <strong>${t.testName}</strong>
            <div style="font-size:11px;color:#777;">${t.testDescription || 'No description'}</div>
            <div style="font-size:10px;color:#aaa;">${new Date(t.createdAt).toLocaleString()}</div>
          </div>
        `).join('');
            }

            exportBtn.dataset.id = id;
            clearBtn.dataset.id = id;
        }
    });

    // ====== Close modal ======
    closeModal?.addEventListener('click', () => modal.classList.add('hidden'));
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    // ====== Export collection as Cypress suite ======
    exportBtn?.addEventListener('click', async () => {
        const id = exportBtn.dataset.id;
        if (!id) return;

        const data = await chrome.storage.local.get('collections');
        const collection = (data.collections || []).find(c => c.id === id);
        if (!collection || !collection.tests?.length) {
            showToast('No tests to export', 'error');
            return;
        }

        const suiteName = collection.name;

        // Extract inner test body only (remove outer describe/it)
        const codeBlocks = collection.tests.map((t, i) => {
            let body = '';
            try {
                // Get content inside the first "it(... => { ... })"
                const itMatch = t.code.match(/it\s*\([^)]*?\{\s*([\s\S]*?)\s*\}\s*\)\s*;/);
                if (itMatch && itMatch[1]) body = itMatch[1].trim();
                else {
                    // fallback — just take anything between first and last brace
                    const braceStart = t.code.indexOf('{');
                    const braceEnd = t.code.lastIndexOf('}');
                    if (braceStart !== -1 && braceEnd !== -1) {
                        body = t.code.substring(braceStart + 1, braceEnd - 1).trim();
                    }
                }

                // 🧹 Cleanup: remove nested describe/it lines if present
                body = body
                    .replace(/describe\s*\([^)]*\)\s*\{[\s\S]*?\}/g, '')
                    .replace(/it\s*\([^)]*\)\s*\{/, '')
                    .replace(/\}\s*$/, '')
                    .trim();

            } catch (err) {
                console.warn('Failed to parse test body:', err);
            }

            // Metadata header for each test
            const metaHeader = [
                `  /**`,
                `   * Test: ${t.testName}`,
                `   * Description: ${t.testDescription || 'No description'}`,
                `   * Recorded: ${new Date(t.createdAt).toLocaleString()}`,
                `   */`
            ].join('\n');

            return `
${metaHeader}
  it('${t.testName || `Test ${i + 1}`}', () => {
    ${body || '// [No recorded steps found]'}
  });`;
        }).join('\n');

        const suiteCode = `/**
 * Test Suite: ${suiteName}
 * Total Tests: ${collection.tests.length}
 * Exported: ${new Date().toLocaleString()}
 */
describe('${suiteName}', () => {
${codeBlocks}
});
`;

        const filename = `${suiteName.toLowerCase().replace(/\s+/g, '_')}_suite.cy.js`;
        downloadFile(suiteCode, filename, 'text/plain');
        showToast(`📦 Exported ${collection.tests.length} tests`, 'success');
    });


    // ====== Clear all tests from a collection ======
    clearBtn?.addEventListener('click', async () => {
        const id = clearBtn.dataset.id;
        const data = await chrome.storage.local.get('collections');
        const collections = data.collections || [];
        const collection = collections.find(c => c.id === id);
        if (!collection) return;

        if (confirm(`Clear all tests in "${collection.name}"?`)) {
            collection.tests = [];
            await chrome.storage.local.set({ collections });
            showToast('🧹 Tests cleared', 'info');
            modalBody.innerHTML = `<div style="color:#666;">No tests yet in this collection.</div>`;
        }
    });

    // ====== Initial render ======
    renderCollections();
}