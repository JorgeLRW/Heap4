import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DemoStore } from './demoStore';

const app = express();
const httpServer = createServer(app);
const demoStore = new DemoStore();
const port = Number(process.env.PORT || 3001);

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin browser requests and non-browser clients omit the Origin header.
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed to call this API.`));
    },
  }),
);
app.use(express.json({ limit: '256kb' }));

function getDemoSessionId(req: express.Request): string {
  const candidate = req.header('X-Heap-Session-ID') || '';
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(candidate)) {
    throw new Error('A valid X-Heap-Session-ID header is required.');
  }
  return candidate;
}

function sendError(res: express.Response, error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  res.status(status).json({ success: false, error: message });
}

function startRepairInBackground(sessionId: string): void {
  void demoStore.startRepair(sessionId).catch((error) => {
    console.error(
      JSON.stringify({
        message: 'local repair execution failed',
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', application: 'heap-4', version: '1.0.0' });
});

app.get('/api/demo/state', (req, res) => {
  try {
    res.json(demoStore.getState(getDemoSessionId(req)));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/demo/reset', (req, res) => {
  try {
    res.json(demoStore.reset(getDemoSessionId(req)));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/demo/intents/:intentId/send', (req, res) => {
  try {
    const intentId = req.header('X-Heap-Intent-ID');
    const requestId = req.header('X-Request-ID');
    if (!intentId || intentId !== req.params.intentId || !requestId) {
      return sendError(res, new Error('Intent and request correlation headers are required.'));
    }

    const sessionId = getDemoSessionId(req);
    const result = demoStore.sendInvoice(sessionId, req.body.intent, requestId);
    if (!result.success) startRepairInBackground(sessionId);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

app.post('/api/demo/intents/:intentId/repair', (req, res) => {
  try {
    const sessionId = getDemoSessionId(req);
    const result = demoStore.requestRepair(sessionId, req.params.intentId);
    startRepairInBackground(sessionId);
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/demo/intents/:intentId/context', (req, res) => {
  try {
    const source = req.body?.source === 'agent' ? 'agent' : 'user';
    res.json(
      demoStore.appendIntentContext(
        getDemoSessionId(req),
        req.params.intentId,
        String(req.body?.text || ''),
        source,
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/demo/repairs/:jobId/deploy', (req, res) => {
  try {
    res.json(demoStore.deployRepair(getDemoSessionId(req), req.params.jobId));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/demo/intents/:intentId/resume', (req, res) => {
  try {
    res.json(demoStore.resumeIntent(getDemoSessionId(req), req.params.intentId));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/demo/recovery-scenario', (req, res) => {
  try {
    const scenario = req.body?.scenario;
    if (scenario !== 'portal_outage' && scenario !== 'portal_only') {
      throw new Error('Recovery scenario must be portal_outage or portal_only.');
    }
    res.json(demoStore.setRecoveryScenario(getDemoSessionId(req), scenario));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/demo/intents/:intentId/access-grants', async (req, res) => {
  try {
    const issuedVia = req.body?.issuedVia === 'webmcp_agent' ? 'webmcp_agent' : 'user';
    const userConfirmation = String(req.body?.userConfirmation || '').slice(0, 200);
    res.json(
      await demoStore.createScopedAccessGrant(
        getDemoSessionId(req),
        req.params.intentId,
        String(req.body?.contactId || ''),
        Number(req.body?.expirationMinutes),
        req.body?.scope,
        issuedVia,
        userConfirmation,
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/demo/intents/:intentId/procurement-portal', (req, res) => {
  try {
    res.json(
      demoStore.uploadInvoiceToProcurementPortal(
        getDemoSessionId(req),
        req.params.intentId,
        String(req.body?.contactId || ''),
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/demo/intents/:intentId/access-grants/revoke', (req, res) => {
  try {
    const reason = String(req.body?.reason || '').slice(0, 200) || 'No reason supplied.';
    res.json(demoStore.revokeAlternateAccess(getDemoSessionId(req), req.params.intentId, reason));
  } catch (error) {
    sendError(res, error);
  }
});

// Deliberately unauthenticated: the recipient holds a scoped capability token,
// not a session. Authority comes from the token's scope, expiry, and revocation.
app.get('/api/demo/invoice-access/:token', async (req, res) => {
  try {
    const result = await demoStore.readInvoiceByAccessToken(String(req.params.token));
    res.status(result.success ? 200 : 403).json(result);
  } catch {
    res.status(403).json({ success: false, error: 'This share link is not valid.' });
  }
});

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(serverDirectory, '../dist');
if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDirectory, 'index.html'));
  });
}

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Heap 4 is running at http://localhost:${port}`);
});
