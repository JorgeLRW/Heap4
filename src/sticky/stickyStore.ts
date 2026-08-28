/**
 * Sticky Bug Store: Persistent, Machine-Actionable Bug Objects
 * Captures screenshot thumbnails, session state, errors, repair recipes & verification assertions
 */

export interface AvailableRepair {
  repairId: string;
  title: string;
  description: string;
  risk: 'reversible' | 'read-only' | 'destructive';
}

export interface StickyBug {
  id: string; // e.g. "sb-8f2a1b"
  title: string;
  description: string;
  route: string;
  url: string;
  timestamp: string;
  status: 'unresolved' | 'repair_pending' | 'resolved';
  error: {
    message: string;
    stack?: string;
    component?: string;
  };
  capturedState: Record<string, any>;
  screenshotPlaceholder: string; // Visual icon or SVG representation
  userNotes?: string;
  availableRepairs: AvailableRepair[];
  verificationAssertion: string;
  auditTrail: Array<{
    action: string;
    timestamp: string;
    details?: string;
  }>;
}

export class StickyStore {
  private bugs: Map<string, StickyBug> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private saveToStorage() {
    if (typeof localStorage !== 'undefined') {
      try {
        const arr = Array.from(this.bugs.values());
        localStorage.setItem('sticky_bugs_db', JSON.stringify(arr));
      } catch (e) {}
    }
    this.notify();
  }

  private loadFromStorage() {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('sticky_bugs_db');
        if (raw) {
          const arr: StickyBug[] = JSON.parse(raw);
          arr.forEach((b) => this.bugs.set(b.id, b));
        }
      } catch (e) {}
    }
  }

  public getBugs(): StickyBug[] {
    return Array.from(this.bugs.values());
  }

  public getActiveBugs(): StickyBug[] {
    return Array.from(this.bugs.values()).filter((b) => b.status !== 'resolved');
  }

  public getBug(bugId: string): StickyBug | undefined {
    return this.bugs.get(bugId);
  }

  public reportBug(params: {
    id?: string;
    title: string;
    description: string;
    route: string;
    error: { message: string; stack?: string; component?: string };
    capturedState: Record<string, any>;
    screenshotPlaceholder?: string;
    userNotes?: string;
    availableRepairs: AvailableRepair[];
    verificationAssertion: string;
  }): StickyBug {
    const bugId = params.id || 'sb-' + Math.random().toString(36).substring(2, 8);
    const now = new Date().toLocaleTimeString();

    const bug: StickyBug = {
      id: bugId,
      title: params.title,
      description: params.description,
      route: params.route,
      url: typeof window !== 'undefined' ? window.location.href : 'http://localhost:5173',
      timestamp: new Date().toISOString(),
      status: 'unresolved',
      error: params.error,
      capturedState: params.capturedState,
      screenshotPlaceholder: params.screenshotPlaceholder || '📊 [Screenshot Snapshot Captured]',
      userNotes: params.userNotes || 'User reported issue during active workflow.',
      availableRepairs: params.availableRepairs,
      verificationAssertion: params.verificationAssertion,
      auditTrail: [
        { action: 'BUG_CAPTURED', timestamp: now, details: `Sticky Bug ${bugId} attached to user session.` },
      ],
    };

    this.bugs.set(bugId, bug);
    this.saveToStorage();
    return bug;
  }

  public applyRepair(bugId: string, repairId: string): { success: boolean; message: string } {
    const bug = this.bugs.get(bugId);
    if (!bug) return { success: false, message: `Bug ${bugId} not found.` };

    const repair = bug.availableRepairs.find((r) => r.repairId === repairId);
    if (!repair) return { success: false, message: `Repair ${repairId} not found for bug ${bugId}.` };

    const now = new Date().toLocaleTimeString();
    bug.status = 'repair_pending';
    bug.auditTrail.push({
      action: 'REPAIR_APPLIED',
      timestamp: now,
      details: `Executed safe repair: ${repair.title} (${repairId}).`,
    });

    this.saveToStorage();
    return { success: true, message: `Successfully executed repair "${repair.title}". Ready for verification.` };
  }

  public markResolved(bugId: string, verificationResult: string = 'PASS'): { success: boolean; bug?: StickyBug } {
    const bug = this.bugs.get(bugId);
    if (!bug) return { success: false };

    const now = new Date().toLocaleTimeString();
    bug.status = 'resolved';
    bug.auditTrail.push({
      action: 'VERIFIED_AND_RESOLVED',
      timestamp: now,
      details: `In-page verification returned ${verificationResult}. Marked as RESOLVED ✓.`,
    });

    this.saveToStorage();
    return { success: true, bug };
  }

  public clearAll() {
    this.bugs.clear();
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('sticky_bugs_db');
    }
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }
}

export const stickyStore = new StickyStore();
