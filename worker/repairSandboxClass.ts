import { Sandbox } from '@cloudflare/sandbox';

/**
 * Production repair jobs run with public internet access disabled. The Worker
 * remains the trusted control plane and can add narrowly brokered egress later
 * without placing repository or provider credentials inside the container.
 */
export class RepairSandbox extends Sandbox {
  enableInternet = false;
}
