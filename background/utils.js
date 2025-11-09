
export function buildPrompt(inputData) {
    return `Generate comprehensive test cases for this feature:

Feature: ${inputData.featureText}
Test Type: ${inputData.testType}
Risk Level: ${inputData.riskLevel}

Include:
1. 3-5 Positive test cases (happy path scenarios)
2. 3-5 Negative test cases (error handling)
3. 2-3 Edge cases (boundary conditions)
4. Security considerations
5. Performance notes (if applicable)

Format each test case:
- Test ID: TC-XXX
- Title: Clear, descriptive title
- Priority: P0/P1/P2
- Preconditions: What must be true before test
- Steps: Numbered, specific actions
- Expected Result: Clear success criteria`;
}

export function generateFallbackTests(inputData) {
    const { featureText, testType, riskLevel } = inputData;

    return `🧪 TEST CASES FOR: ${featureText}

Test Type: ${testType} | Risk Level: ${riskLevel}

✅ POSITIVE TESTS

TC-001: Basic Functionality
Priority: P0
Preconditions: Application is accessible
Steps:
1. Navigate to the feature
2. Verify all UI elements are visible
3. Execute the primary action
4. Verify expected outcome
Expected: Feature works as designed

TC-002: Valid Input Handling
Priority: P0
Steps:
1. Enter valid data in all fields
2. Submit the form/action
3. Verify success message
4. Confirm data is processed
Expected: System accepts valid inputs

TC-003: Sequential Operations
Priority: P1
Steps:
1. Complete operation A successfully
2. Verify state change
3. Complete operation B
4. Verify operations integrate correctly
Expected: Multi-step workflows succeed

❌ NEGATIVE TESTS

TC-004: Invalid Input Handling
Priority: P0
Steps:
1. Enter invalid/malformed data
2. Attempt submission
3. Verify error handling
Expected: Clear error messages, no crash

TC-005: Required Field Validation
Priority: P0
Steps:
1. Leave required fields empty
2. Attempt submission
3. Check validation messages
Expected: All required fields flagged

TC-006: Unauthorized Access
Priority: P1
Steps:
1. Logout or use restricted account
2. Attempt to access feature
3. Verify access control
Expected: Access denied appropriately

🔍 EDGE CASES

TC-007: Boundary Values
Priority: P1
Steps:
1. Test minimum acceptable value
2. Test maximum acceptable value
3. Test min-1 and max+1
Expected: Proper boundary validation

TC-008: Special Characters
Priority: P2
Steps:
1. Input special chars: !@#$%^&*
2. Input unicode: 中文, عربي
3. Verify handling
Expected: All characters processed safely

🔒 SECURITY CHECKS

TC-009: Input Sanitization
Priority: P0 (if risk is HIGH)
Steps:
1. Attempt SQL injection
2. Attempt XSS attack
3. Verify inputs are sanitized
Expected: No code execution

TC-010: Session Security
Priority: P1
Steps:
1. Login and capture session
2. Logout
3. Try to reuse old session
Expected: Session invalidated

⚡ PERFORMANCE NOTES
- Response time target: < 2 seconds
- Handle concurrent users gracefully
- No memory leaks during extended use

📱 COMPATIBILITY
- Test on Chrome, Firefox, Safari, Edge
- Mobile: iOS Safari, Chrome Android
- Responsive design validation

Total: 10 test cases
Est. Time: ${riskLevel === 'High' || riskLevel === 'Critical' ? '3-4 hours' : '1-2 hours'}`;
}
