<div align="center">
   <img src="https://raw.githubusercontent.com/Sahar-dev/QA-AI-Assistant/main/.github/banner.png" alt="QA AI Assistant Banner" width="100%"/>

   <h1>🧠 QA AI Assistant</h1>
   <p><strong>From QA engineers, for QA engineers.</strong></p>
   <p>AI-powered Chrome extension that brings test generation, accessibility audits, and bug reporting right into your browser.</p>
   <p><em>No context-switching, no tab-hopping — just quality, faster.</em></p>

   <p>
      <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square"/>
      <img src="https://img.shields.io/badge/OpenAI-GPT--4-orange?style=flat-square"/>
      <img src="https://img.shields.io/badge/Google-Gemini-4285F4?style=flat-square"/>
      <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square"/>
   </p>
</div>

---

## 🧭 What is QA AI Assistant?

Imagine if your Chrome DevTools sidebar grew a brain.

QA AI Assistant is a **modular, AI-powered QA copilot** that lives in your browser and helps you:

- 🖱 **Record test sessions** with automated action capture
- 🧪 **Generate Playwright, Cypress, or Postman tests** instantly from recordings or prompts
- ♿ **Run WCAG accessibility audits** with AI-powered fix suggestions
- 🐞 **File polished bug reports** with screenshots and AI summaries
- ⚙️ **Export or sync** to GitHub, Jira, and TestRail with one click

No more messy spreadsheets. No more copy-pasting stack traces into Jira at 3AM.

---

## 🚀 Why You'll Actually Use It

| Because you're tired of... | QA AI Assistant does this instead |
|-----------------------------|----------------------------------|
| Writing test scripts from scratch | 🧠 Generates tests from your actions or text prompts |
| Checking accessibility manually | ♿ Runs full axe-core audits with AI fix hints |
| Creating tickets by hand | 🐞 Auto-creates GitHub/Jira issues with screenshots & AI summaries |
| Losing session data | 💾 Records everything locally — nothing leaves your machine |
| Switching tabs 100 times | 🧩 Everything runs right inside your sidebar |

---

## ✨ Core Features

### 🎥 Session Recording
Captures every user action—clicks, inputs, navigation, network requests, and errors—for replay and automated test creation.

### 🧠 AI Test Generation
Converts feature descriptions or recorded sessions into runnable Playwright, Cypress, or Postman test scripts using OpenAI GPT-4 or Google Gemini.

### ♿ Accessibility Audit
Scans any page for WCAG 2.1 compliance issues using `axe-core`, provides severity scores, and offers AI-generated fix suggestions.

### 🐞 Bug Reporting
Auto-fills polished GitHub or Jira tickets with screenshots, stack traces, and AI-generated summaries—directly from the sidebar.

### 📊 AI Audit Reports
Combines all accessibility findings into comprehensive, AI-written reports that can be exported as GitHub/Jira issues.

### 🔐 Offline-First & Secure
Everything runs locally in your browser. Your API keys and test data never leave your machine.

### 🧩 Integrations
- **GitHub**: Create issues with labels and screenshots
- **Jira**: File tickets with AI summaries
- **TestRail**: Export test cases *(coming soon)*

---

## 💻 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/Sahar-dev/QA-AI-Assistant.git
```

1. Open Chrome and navigate to `chrome://extensions`
2. Toggle **Developer Mode** (top right)
3. Click **Load unpacked** → select the cloned folder
4. Click the 🧠 icon in your toolbar → Sidebar opens
5. Add your OpenAI or Gemini API key under **Settings**
6. Start recording, testing, and analyzing!

---

## 🧩 Architecture Overview

```
QA-AI-Assistant/
│
├── background/      → Core extension services (recording, extraction, storage, axe injection)
├── core/            → Shared logic (AI, GitHub/Jira APIs, utilities)
├── recording/       → Session recorder & timeline viewer
├── ui/              → Modular sidebar UI components (Bug Reports, Accessibility, etc.)
│
├── sidebar.html     → Sidebar layout
├── sidebar.js       → Entry point / app orchestrator
└── manifest.json    → Chrome Manifest V3 configuration
```

<div align="center">
  <img src="./docs/qa-ai-architecture.svg" width="95%" alt="QA AI Assistant Architecture Diagram">
</div>

---

## 🧠 How It Works (in 5 steps)

1. **Explore** a feature in your web app — the recorder quietly captures every action
2. **Generate** — AI transforms recordings into runnable test scripts (Playwright, Cypress, or Postman)
3. **Audit** — axe-core checks accessibility; AI explains each issue with fix suggestions
4. **Report** — Click "Report" to file a perfect GitHub/Jira issue with screenshots
5. **Relax** — Your PM thinks you're magic ✨

---

## ⚙️ Developer Setup

No build step, no bundler — pure ES modules.

```bash
# Clone the repository
git clone https://github.com/Sahar-dev/QA-AI-Assistant.git
cd QA-AI-Assistant

# Optional: Install formatting tools
npm install prettier eslint --save-dev
npm run format
```

Reload the extension in Chrome (`chrome://extensions`) whenever you modify files.

---

## 📊 Feature Matrix

| Capability | Description | Module(s) | AI Involved | Output |
|-----------|-------------|-----------|-------------|--------|
| 🎥 **Session Recording** | Captures DOM events, inputs, navigation | `recording/recorder.js` | ❌ | JSON Timeline |
| 🧠 **AI Test Generation** | Converts recordings/prompts into test scripts | `core/ai.js`, `background/codegen.js` | ✅ | Playwright / Cypress / Postman |
| ♿ **Accessibility Audit** | Runs axe-core, rates issues, gives fixes | `ui/accessibility.js`, `background/accessibility.js` | ✅ | WCAG Report |
| 🐞 **Bug Reporting** | Submits AI-enhanced bug reports | `ui/bug-reports.js`, `core/github.js`, `core/jira.js` | ✅ | Markdown Issue |
| 📊 **Audit Report Generator** | Groups violations with AI summary | `ui/accessibility.js` | ✅ | Audit Report Issue |
| 🔐 **Storage / Settings** | Handles secure config and API keys | `ui/settings.js`, `core/storage.js` | ❌ | Chrome Sync |
| 🧩 **Integrations** | Connects GitHub, Jira, TestRail | `core/github.js`, `core/jira.js` | ✅ | Synced Issues |
| 🧠 **AI Dual Engine** | Switch between GPT-4 & Gemini | `core/ai.js` | ✅ | Adaptive Response |

---

## 🔒 Permissions & Security

| Permission | Why We Need It |
|-----------|---------------|
| `activeTab`, `scripting` | Inject audits & extract DOM info |
| `storage` | Save settings & test data locally |
| `sidePanel` | Run inside Chrome sidebar |
| `<all_urls>` | Enable cross-site audit testing |

### 🔐 Privacy First
- **Nothing leaves your machine** — all processing happens locally
- **API keys** are stored in `chrome.storage.sync` (encrypted by Chrome)
- **No telemetry** — we don't track your usage or collect data
- **AI calls are client-side** — your workspace stays private

---

## 🧱 Tech Stack

| Category | Tool / Library |
|---------|---------------|
| **Language** | JavaScript (ES Modules) |
| **Extension API** | Chrome Manifest V3 |
| **Accessibility Engine** | axe-core |
| **AI Engines** | OpenAI GPT-4, Google Gemini |
| **Integrations** | GitHub REST API, Jira Cloud API |
| **Design** | Tailwind-inspired CSS + native HTML |
| **Test Export** | Playwright, Cypress, Postman formats |
| **Reporting** | Markdown-based summaries |

---

## 🧰 Pro QA Tips

- **Shift + Click** the run button to include console logs in your test recording
- **Alt + R** toggles recording — handy during exploratory sessions
- **Audit early, not after UAT** — your developers will thank you
- **Keep your AI key local** — don't commit `.env` or extension storage data
- **Use GitHub labels** like "QA-Copilot" to filter AI-generated issues easily

---

## 🗺️ Roadmap

- [ ] TestRail & Xray export support
- [ ] Performance audit integration (Lighthouse API)
- [ ] Inline accessibility auto-fix suggestions
- [ ] AI-based regression analysis
- [ ] Multi-user cloud dashboard (team QA view)
- [ ] Visual regression testing
- [ ] Custom test template library

---

## 🤝 Contributing

We're QA engineers — we like clean commits and honest pull requests.

1. **Fork** this repository
2. **Create** a feature branch: `feat/<your-feature>`
3. **Keep it modular** — no spaghetti code allowed 🍝
4. **Test your changes** inside Chrome's sidebar
5. **Submit a PR** with screenshots or demo notes

**Remember:** A good QA tool deserves good QA.

### Development Guidelines
- Use ESLint and Prettier for code formatting
- Write clear commit messages
- Add comments for complex logic
- Test on multiple websites before submitting
- Update documentation for new features

---

## 📝 License

**MIT License** © 2025

Built by QA engineers, for QA engineers — because we were tired of manually writing the same test 200 times.

---

## 🙏 Acknowledgments

Thanks to the open-source community and the amazing tools that make this possible:
- [axe-core](https://github.com/dequelabs/axe-core) for accessibility testing
- [Playwright](https://playwright.dev/) for browser automation
- [OpenAI](https://openai.com/) and [Google Gemini](https://deepmind.google/technologies/gemini/) for AI capabilities

---

<div align="center">
   <sub>💜 QA AI Assistant — Where testing meets automation meets common sense.</sub>
   <br>
   <sub>Made with ❤️ by the QA community</sub>
</div>