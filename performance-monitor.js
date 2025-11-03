// performance-monitor.js
class PerformanceMonitor {
    static performanceBudgets = {
        'LCP': 2500, // Largest Contentful Paint
        'FID': 100,  // First Input Delay
        'CLS': 0.1,  // Cumulative Layout Shift
        'FCP': 1000  // First Contentful Paint
    };

    static async checkPerformanceBudget(pageUrl) {
        const performanceMetrics = await this.measurePerformance(pageUrl);
        const violations = [];

        Object.keys(this.performanceBudgets).forEach(metric => {
            if (performanceMetrics[metric] > this.performanceBudgets[metric]) {
                violations.push({
                    metric,
                    expected: this.performanceBudgets[metric],
                    actual: performanceMetrics[metric],
                    violation: `${((performanceMetrics[metric] - this.performanceBudgets[metric]) / this.performanceBudgets[metric] * 100).toFixed(1)}% over budget`
                });
            }
        });

        return {
            status: violations.length === 0 ? 'PASS' : 'FAIL',
            metrics: performanceMetrics,
            violations,
            recommendations: this.generatePerformanceRecommendations(violations)
        };
    }
}