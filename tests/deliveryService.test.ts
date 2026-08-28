import {
  DeliveryProviderConfigurationError,
  sendInvoiceDelivery,
} from '../src/server/services/DeliveryService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

console.log('\n🧪 Running tests/deliveryService.test.ts...\n');

let buildAFailedWithProviderError = false;
try {
  sendInvoiceDelivery(
    { id: 'INV-2841', recipient: 'billing@acme.example', amount: 4850 },
    'demo-build-a',
  );
} catch (error) {
  buildAFailedWithProviderError = error instanceof DeliveryProviderConfigurationError;
}
assert(buildAFailedWithProviderError, 'Build A executes the reproducible provider defect');

const receipt = sendInvoiceDelivery(
  { id: 'INV-2841', recipient: 'billing@acme.example', amount: 4850 },
  'demo-build-b',
);
assert(receipt.invoiceId === 'INV-2841', 'Build B returns a delivery receipt for the existing invoice');
assert(receipt.provider === 'mail.acme.example', 'Build B uses the configured outbound provider');

console.log(`\nResults: ${passed} Passed, ${failed} Failed\n`);
if (failed > 0) process.exit(1);
