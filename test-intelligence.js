// test-intelligence.js
class TestIntelligence {
    static generateTestCases(featureData) {
        const riskLevel = this.assessRisk(featureData);
        const testTypes = this.determineTestTypes(featureData);

        return {
            unitTests: this.generateUnitTests(featureData),
            integrationTests: this.generateIntegrationTests(featureData),
            e2eTests: this.generateE2ETests(featureData),
            performanceTests: riskLevel === 'HIGH' ? this.generatePerformanceTests(featureData) : null,
            securityTests: this.containsUserData(featureData) ? this.generateSecurityTests(featureData) : null
        };
    }

    static assessRisk(featureData) {
        const riskKeywords = ['payment', 'login', 'password', 'financial', 'user data'];
        return riskKeywords.some(keyword =>
            featureData.description.toLowerCase().includes(keyword)
        ) ? 'HIGH' : 'MEDIUM';
    }

    static generatePerformanceTests(featureData) {
        return `🚀 PERFORMANCE TESTS for ${featureData.title}
    
    Load Testing:
    - 100 concurrent users for 5 minutes
    - Response time < 2 seconds for 95% of requests
    - Error rate < 1%
    
    Stress Testing:
    - Gradually increase to 500 users
    - Identify breaking point
    - Monitor memory leaks
    
    Endurance Testing:
    - 24-hour continuous operation
    - Memory usage stability
    - No performance degradation`;
    }
}