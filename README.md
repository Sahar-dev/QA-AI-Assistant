# 🧠 QA AI Assistant

<div align="center">
   <img src="https://raw.githubusercontent.com/Sahar-dev/QA-AI-Assistant/main/.github/banner.png" alt="QA AI Assistant Banner" width="100%"/>
   
   <p><strong>The testing tool that doesn't care what your job title is.</strong></p>
   
   <p>
      <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square"/>
      <img src="https://img.shields.io/badge/OpenAI-GPT--4-orange?style=flat-square"/>
      <img src="https://img.shields.io/badge/Google-Gemini-4285F4?style=flat-square"/>
      <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square"/>
   </p>
</div>

---

## 👋 Hey There

So you know how testing is simultaneously the most important and most tedious part of development? Yeah, I got tired of that too.

**QA AI Assistant** is a Chrome extension I built because I was spending way too much time writing test scripts, checking accessibility, and filing bug reports when I could've been doing literally anything else.

**What it does:** Records your browser sessions, generates test code with AI, runs accessibility audits, and creates bug reports that actually make sense. All from your browser sidebar.

**Who it's for:** QA engineers, developers, product managers, designers—anyone who needs to test web stuff and doesn't want to die of boredom doing it.

---

## 🎯 Why You Might Actually Use This

| Your Daily Struggle | What This Thing Does |
|---------------------|----------------------|
| "I need to write tests for this new feature..." | 🤖 Describe the feature or record yourself using it. AI writes Playwright/Cypress/Postman tests. |
| "Is this accessible?" (Checks 47 WCAG criteria manually) | ♿ One click. Full axe-core audit. AI explains what's broken and how to fix it. |
| "Found a bug. Time to fill out this 15-field Jira form..." | 🐞 Auto-filled bug reports with screenshots and AI summaries. Push to GitHub/Jira in one click. |
| "Wait, how did we test this last sprint?" | 💾 Save sessions to Collections. Replay whenever. Never lose that perfect test flow again. |
| Juggling 6 tabs between dev tools, Jira, test docs... | 🎯 Everything in one sidebar. No context switching. Your sanity stays intact. |

**Bottom line:** Less clicking, more building. Whether you're a dev who tests their own code or a QA engineer swimming in regression tests, this saves time.

---

## ✨ What's Actually In Here

### 🎥 Session Recording
Records everything—clicks, inputs, navigation, network calls, console errors. Three modes: Standard (basics), Exploratory (when you're poking around), Bug Hunt (captures everything).

Pick what you want to record: mouse hovers, scrolls, network requests, assertions. Custom presets because one size fits nobody.

### 🧪 AI Test Generation
The fun part. Give it a feature description or use your recorded session. Pick your test type (functional, E2E, integration, security). Set risk level. Watch AI generate test cases with proper IDs and assertions.

**Works with:** Playwright, Cypress, Postman. Export as ready-to-use `.spec.js` files.

**Real talk:** The AI isn't perfect, but it's faster than writing from scratch and thinks of edge cases you might miss at 5 PM on Friday.

### 🎯 Smart Feature Extraction
Click "Extract" on any page and it reads the DOM—grabs page title, URL, form fields, buttons, everything. Pastes it into your description box.

**Translation:** Stop typing "login form with email field, password field, remember me checkbox" manually. The computer can read.

### ♿ Accessibility Audits
One-click axe-core WCAG 2.1 scans. AI explains violations in plain English, ranks by severity, suggests fixes.

Export as Markdown, GitHub issues, or Jira tickets. Great for devs who need to know what's wrong, designers who need to know why, and PMs who need to know it's being fixed.

**Pro tip for devs:** Run these during development, not after someone files an angry accessibility complaint.

### 🐞 Bug Reports That Don't Get Ignored
Auto-filled templates with:
- Screenshots (automatic)
- Console logs
- Session breadcrumbs
- Stack traces
- AI-generated summary (toggle on/off)
- Severity and feature tags

Push to GitHub or Jira. Or keep it local until you're ready to break someone's flow.

**For devs:** Better bug reports = less "Need More Info" back-and-forth. Everyone wins.

### 🗃️ Collections
Save anything worth keeping: sessions, tests, audit reports. Organize by feature, sprint, or "Things That Broke Prod."

Use cases:
- Regression test library
- Onboarding new team members
- "See, I told you this edge case exists"
- Showing your boss you actually work

### 🔐 Privacy First
Client-side only. API keys encrypted in Chrome. Test data lives in your browser. Nothing uploads anywhere.

**For corporate folks:** Your internal app data isn't leaving your machine or training someone's AI model.

---

## 🚀 Setup (5 Minutes, Actually)

### Installation

```bash
git clone https://github.com/Sahar-dev/QA-AI-Assistant.git
```

1. Chrome → `chrome://extensions`
2. Enable "Developer Mode" (top right)
3. "Load unpacked" → select the cloned folder
4. Pin the 🧠 icon to your toolbar
5. Open sidebar → Settings → Add your OpenAI or Gemini API key
6. Go to any website and start testing

**API Key:** Need OpenAI or Google Gemini API key. Get one from their developer portals. Free tiers exist. Won't judge.

---

## 📖 How To Actually Use This

### Recording Sessions
1. Go to the page you want to test
2. (Optional) Click "Extract" for auto-filled context
3. Pick mode: Standard, Exploratory, or Bug Hunt
4. Hit Record → do your thing → Stop
5. Review timeline, edit if needed, save to Collections

**Shortcut:** `Alt + R` toggles recording

### Generating Tests
**From recording:**
- Open saved session → "Generate Tests"
- Pick framework (Playwright/Cypress/Postman)
- Choose test type & risk level
- Let AI generate test cases
- Review and export

**From description:**
- Write/paste feature description or user story
- Same steps as above
- AI creates test scaffolding with IDs, steps, assertions

**Note:** You'll still need to review. AI is smart but not "merge to main without looking" smart.

### Running Accessibility Audits
1. Navigate to page
2. Sidebar → Accessibility
3. "Run Audit"
4. Review violations (sorted by severity)
5. Click any issue for AI fix suggestions
6. Export report or create issues

**When to run:**
- **Devs:** During development (catch issues early)
- **QA:** Before releases (final check)
- **PMs:** When planning accessibility improvements
- **Designers:** When validating implementations

### Filing Bugs
1. Find bug (the easy part)
2. Sidebar → Bug Reports
3. Fill title (auto-suggests from page)
4. Set severity & affected feature
5. Toggle "AI Summary" if you're lazy (it's fine, we all are)
6. Add manual notes if needed
7. Push to GitHub or Jira

**For developers:** Use this for your own bugs during development. Better than sticky notes.

---

## 💡 Tips & Tricks

### Shortcuts
- `Alt + R` → Toggle recording
- `Shift + Click` Run → Include console logs

### Best Practices
- **Extract features early** → Better context = better results
- **Use Collections** → Organize as you go, thank yourself later
- **Review AI output** → It's good, not perfect
- **Run audits during dev** → Fixes are cheaper early
- **Tag things properly** → Future you will appreciate it

### For Different Roles

**Developers:**
- Record your manual testing, generate automation after
- Run accessibility audits before PRs
- File bugs for yourself (better than TODOs in code)
- Save test flows for regression

**QA Engineers:**
- Use AI to speed up test creation
- Collections for regression suites
- Bug reports with better context
- Accessibility audits for compliance

**Product Managers:**
- Record user flows for documentation
- Accessibility reports for planning
- Bug reports with business context
- Session recordings for repro steps

**Designers:**
- Accessibility audits on implementations
- Bug reports for visual issues
- Session recordings to show expected behavior

---

## 🏗️ Architecture (For The Nerds)

```
QA-AI-Assistant/
├── background/          → Core services
│   ├── recorder.js      → Session capture
│   ├── accessibility.js → axe-core integration
│   └── codegen.js       → Test generation
├── core/                → Shared logic
│   ├── ai.js            → AI orchestration
│   ├── github.js        → GitHub API
│   ├── jira.js          → Jira API
│   └── storage.js       → Chrome storage
├── ui/                  → Sidebar components
│   ├── accessibility.js → Audit UI
│   ├── bug-reports.js   → Bug filing
│   ├── test-gen.js      → Test generation UI
│   └── collections.js   → Saved items
├── recording/           → Timeline viewer
├── sidebar.html         → Main UI
└── manifest.json        → Chrome config
```

Pure ES modules. No build step. No webpack. Just JavaScript.

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Language** | JavaScript (ES Modules) |
| **Extension** | Chrome Manifest V3 |
| **Accessibility** | axe-core (WCAG 2.1) |
| **AI** | OpenAI GPT-4 + Google Gemini |
| **Integrations** | GitHub REST API, Jira Cloud API |
| **Test Frameworks** | Playwright, Cypress, Postman |

---

## 🗺️ What's Coming Next

- [ ] TestRail/Xray integration
- [ ] Lighthouse performance audits
- [ ] Auto-fix simple accessibility issues
- [ ] AI regression analysis
- [ ] Team dashboard (multi-user tracking)
- [ ] Visual regression testing
- [ ] Custom test templates
- [ ] Mobile device simulation

Want something? Open an issue or build it and PR.

---

## 🤝 Contributing

Everyone's welcome. Here's the deal:

1. Fork the repo
2. Create a branch: `feat/your-idea`
3. Keep code readable (comments help)
4. Test your changes (in actual Chrome)
5. Write clear commit messages
6. Submit PR with screenshots

### Dev Setup
```bash
git clone https://github.com/Sahar-dev/QA-AI-Assistant.git
cd QA-AI-Assistant

# Optional: formatting tools
npm install prettier eslint --save-dev
npm run format

# Load in Chrome: chrome://extensions → Developer Mode → Load Unpacked
```

**Code style:** ESLint and Prettier configs included. Use them.

---

## 📋 Permissions (What & Why)

| Permission | Reason |
|------------|--------|
| `activeTab` | Read current page for audits |
| `scripting` | Inject axe-core for scans |
| `storage` | Save settings and data locally |
| `sidePanel` | Run the sidebar UI |
| `<all_urls>` | Test any website |

**Privacy:** Everything local. Keys encrypted. No tracking. No telemetry. No "anonymous data collection."

---

## 🐛 Known Issues

- AI test generation occasionally gets creative with names. Review before committing.
- Accessibility audits on heavy SPAs can be slow. Thorough > fast.
- Session recordings on infinite scroll get large. Use wisely.
- Jira API rate limits are Jira's fault, not mine.

Found a bug? Open an issue. Or use the bug reporter to file a bug about the bug reporter. Inception.

---

## 📜 License

**MIT © 2025**

Do whatever you want with it. Build on it. Break it. Fix it. Just don't blame me if something explodes.

---

## 🙏 Thanks

Built on the shoulders of:
- **[axe-core](https://github.com/dequelabs/axe-core)** → Best accessibility testing engine
- **[Playwright](https://playwright.dev/)** → Made browser automation actually nice
- **[OpenAI](https://openai.com/)** → GPT-4 for the smart stuff
- **[Google Gemini](https://deepmind.google/technologies/gemini/)** → Fast alternative

---

## 💬 Final Note

Look, I'm not claiming this will solve all your testing problems. But it'll probably solve some of them, and isn't that worth 5 minutes to try?

Built this because I needed it. Sharing it because maybe you need it too. If it saves you even an hour this month, I'll call it a win.

Now go test something.

---

<div align="center">
   <sub>QA AI Assistant — Testing tools for people who have better things to do.</sub><br>
   <sub>Made with ☕ and keyboard shortcuts.</sub>
</div>