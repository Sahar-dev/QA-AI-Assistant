
<div align="center">
   <!-- <img src="https://raw.githubusercontent.com/Sahar-dev/QA-AI-Assistant/main/.github/banner.png" alt="QA AI Assistant Banner" width="100%"/> -->
  
   <h1>QA AI Assistant</h1>
   <p><strong>From QA engineers, for QA engineers.</strong></p>
   <p>AI-powered browser extension for smarter, faster, and more reliable quality assurance.</p>
   <p><em>Supercharge your QA: from recording to test generation — all inside your browser.</em></p>
  

<p>
    <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square"/>
    <img src="https://img.shields.io/badge/OpenAI-GPT--4-orange?style=flat-square"/>
    <img src="https://img.shields.io/badge/Google-Gemini-4285F4?style=flat-square"/>
</p>

</div>

---

<p align="center"><em>Supercharge your QA workflow: record, generate, analyze, and report—all in one sidebar.</em></p>



## Features

- <strong>AI Test Generation</strong>: Instantly create robust test cases for any feature using OpenAI GPT-4 or Google Gemini.
- <strong>Session Recording</strong>: Capture every user action—clicks, inputs, navigation, network, errors, and more—for replay and automated test creation.
- <strong>Bug Reporting</strong>: File, summarize, and export bug reports (with AI summaries and screenshots) directly from the sidebar.
- <strong>Test Orchestration</strong>: Plan and prioritize unit, integration, e2e, performance, and security tests based on feature risk.
- <strong>Visual Testing</strong>: Capture and compare UI screenshots to detect visual regressions.
- <strong>Accessibility & Performance Analysis</strong>: Run accessibility and performance checks on any page.
- <strong>Integrations</strong>: Connect with GitHub, Jira, TestRail, and export Playwright scripts.
- <strong>Customizable</strong>: Choose your AI provider, configure test complexity, and manage integrations in settings.


## Installation

1. **Clone or Download** this repository.
2. **Load as Unpacked Extension**:
   - Go to `chrome://extensions` in your Chromium-based browser.
   - Enable "Developer mode" (top right).
   - Click "Load unpacked" and select the project folder.
3. The "QA AI Assistant" icon will appear in your browser toolbar.


## Usage

- Click the extension icon to open the sidebar.
- Use the tabs to record sessions, generate tests, analyze bugs, and more.
- Configure your AI provider and API key in the Settings tab (OpenAI or Gemini supported).
- Start a recording session to capture user flows and export them as automated tests.
- File bug reports with optional AI-generated summaries and screenshots.
- Export test cases, bug reports, and session data to your preferred tools.

<p align="center">
   <img src="https://raw.githubusercontent.com/Sahar-dev/QA-AI-Assistant/main/.github/usage.gif" alt="QA AI Assistant Usage Example" width="80%"/>
</p>

<sub><em>Above: Example of recording a session and generating tests in the sidebar (replace with your own GIF if available).</em></sub>

## Built With

- JavaScript (ES6+)
- Chrome Extensions API (Manifest V3)
- OpenAI GPT-4 & Google Gemini APIs
- Playwright (for test export)
- HTML5 & CSS3 (modular UI)


## Permissions & Security

- The extension uses certain permissions (like `<all_urls>`) only to analyze pages during QA sessions.
- All data and API keys stay on your device—never sent to external servers unless you explicitly export.
- You can review or limit permissions anytime from Chrome’s extension settings.


## Contributing

Contributions are welcome! To get started:

1. Fork this repository and create a new branch.
2. Make your changes (see `ui/`, `background/`, and `recording/` for main modules).
3. Submit a pull request with a clear description.


### Dev Setup

- No build step required—just load as unpacked extension.
- For code style, use Prettier and ESLint (add a `package.json` if you want to enforce linting).
- Add unit tests for new logic where possible.


## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgments

- Powered by OpenAI and Google Gemini APIs.
- Integrates with GitHub, Jira, and TestRail for seamless QA workflows.

## Maintainers / Contact

- **Lead Maintainer:** [Sahar-dev](https://github.com/Sahar-dev)
- For questions, issues, or feature requests, please open an issue or discussion on GitHub.

---

<div align="center">
   <sub>QA AI Assistant &copy; 2025. Built by QA engineers, for QA engineers.</sub>
</div>
