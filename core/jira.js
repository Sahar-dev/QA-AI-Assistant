import { showToast } from "../core/utils.js";

async function sendToJira(bug, p) {
    try {
        const res = await fetch(`https://${p.jiraDomain}/rest/api/3/issue`, {
            method: "POST",
            headers: {
                Authorization: "Basic " + btoa(`${p.jiraEmail}:${p.jiraToken}`),
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                fields: {
                    project: { key: p.jiraProject },
                    summary: bug.title,
                    description: bug.description,
                    issuetype: { name: "Bug" },
                    priority: { name: bug.severity }
                }
            })
        });
        if (!res.ok) throw new Error(res.statusText);
        showToast("✅ Sent to Jira", "success");
    } catch (err) {
        console.error(err);
        showToast("Jira issue creation failed", "error");
    }
}

async function sendToJira_AuditReport(title, body, s) {
    try {
        const res = await fetch(`https://${s.jiraDomain}/rest/api/3/issue`, {
            method: "POST",
            headers: {
                Authorization: "Basic " + btoa(`${s.jiraEmail}:${s.jiraToken}`),
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                fields: {
                    project: { key: s.jiraProject },
                    summary: title,
                    description: body,
                    issuetype: { name: "Task" },
                    labels: ["Accessibility", "Audit"]
                }
            })
        });
        if (!res.ok) throw new Error(res.statusText);
        showToast("✅ Accessibility Audit Report sent to Jira", "success");
    } catch (err) {
        console.error(err);
        showToast("Jira report creation failed", "error");
    }
}

// ===== JIRA REPORTER FOR A11Y =====
async function sendToJira_A11Y(bug, s) {
    try {
        const res = await fetch(`https://${s.jiraDomain}/rest/api/3/issue`, {
            method: "POST",
            headers: {
                Authorization: "Basic " + btoa(`${s.jiraEmail}:${s.jiraToken}`),
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                fields: {
                    project: { key: s.jiraProject },
                    summary: bug.title,
                    description: bug.description,
                    issuetype: { name: "Bug" },
                    priority: { name: bug.severity }
                }
            })
        });

        if (!res.ok) throw new Error(res.statusText);
        showToast(`✅ Accessibility issue sent to Jira (${bug.severity})`, "success");
    } catch (err) {
        console.error(err);
        showToast("Jira issue creation failed", "error");
    }
}



export {
    sendToJira,
    sendToJira_A11Y,
    sendToJira_AuditReport
};