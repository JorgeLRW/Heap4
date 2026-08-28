import { execSync } from 'child_process';

console.log('🚀 Running Complete Heap 4 Verification Suite...\n');

try {
  console.log('--- 1. Testing Intent Creation & Server Context ---');
  execSync('npx tsx tests/intent.test.ts', { stdio: 'inherit' });

  console.log('\n--- 2. Testing Invariant Guard & Resume Lifecycle ---');
  execSync('npx tsx tests/resume.test.ts', { stdio: 'inherit' });

  console.log('\n--- 3. Testing Dynamic WebMCP Tool Registry & Inspection ---');
  execSync('npx tsx tests/webmcp.test.ts', { stdio: 'inherit' });

  console.log('\n🎉 ALL TEST SUITES PASSED (100%)!');
} catch (err) {
  console.error('\n❌ Test suite failed.');
  process.exit(1);
}
