const SESSION_STORAGE_KEY = 'heap4.demoSessionId';
const SESSION_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;

let cachedSessionId: string | null = null;

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `h4_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `h4_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getDemoSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  if (typeof window === 'undefined') return 'h4_test_session';

  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('session');
  const fromStorage = window.localStorage.getItem(SESSION_STORAGE_KEY);
  cachedSessionId =
    (fromUrl && SESSION_PATTERN.test(fromUrl) && fromUrl) ||
    (fromStorage && SESSION_PATTERN.test(fromStorage) && fromStorage) ||
    createSessionId();

  window.localStorage.setItem(SESSION_STORAGE_KEY, cachedSessionId);
  if (fromUrl !== cachedSessionId) {
    url.searchParams.set('session', cachedSessionId);
    window.history.replaceState(window.history.state, '', url);
  }
  return cachedSessionId;
}

export function setDemoSessionIdForTests(sessionId: string | null): void {
  cachedSessionId = sessionId;
}
