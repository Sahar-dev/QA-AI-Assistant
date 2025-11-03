// exporters.js
class TestExporters {
    static async exportToTestRail(testCases, projectId) {
        const testRailCases = testCases.map((testCase, index) => ({
            title: testCase.title,
            custom_steps: testCase.steps.map(step => `${step.action} -> ${step.expected}`).join('\n'),
            type_id: 1, // Automated
            priority_id: testCase.priority === 'HIGH' ? 4 : 2
        }));

        await fetch(`https://yourcompany.testrail.io/api/v2/add_cases/${projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cases: testRailCases })
        });
    }

    static exportToCypress(testCases) {
        const cypressCode = testCases.map(testCase => `
      it('${testCase.title}', () => {
        ${testCase.steps.map(step => `
          // ${step.action}
          ${this.generateCypressCode(step)}
        `).join('\n')}
      });
    `).join('\n');

        return `describe('${testCases[0].feature}', () => {\n${cypressCode}\n});`;
    }

    static exportToPostman(apiTests) {
        return JSON.stringify({
            info: { name: "Generated API Tests", description: "AI-generated test collection" },
            item: apiTests.map(test => this.createPostmanItem(test))
        }, null, 2);
    }
}