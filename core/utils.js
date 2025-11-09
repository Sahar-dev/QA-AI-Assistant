// core/utils.js
export function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div>${type === "success" ? "✅" : type === "error" ? "❌" : "ℹ️"}</div>
      <div>${message}</div>
  `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = "fadeOut 0.3s";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function copyToClipboard(elementId) {
    const text = document.getElementById(elementId)?.textContent || "";
    if (!text || text.includes("will appear here")) {
        showToast("Nothing to copy", "error");
        return;
    }
    navigator.clipboard
        .writeText(text)
        .then(() => showToast("Copied!", "success"))
        .catch(() => showToast("Failed to copy", "error"));
}

export function downloadFile(content, filename, mimeType = "text/plain") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
