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

app.use(cors());
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

    const result = demoStore.sendInvoice(getDemoSessionId(req), req.body.intent, requestId);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

app.post('/api/demo/intents/:intentId/repair', (req, res) => {
  try {
    res.json(demoStore.requestRepair(getDemoSessionId(req), req.params.intentId));
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
