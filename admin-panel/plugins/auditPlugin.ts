/**
 * Vite plugin: local audit runner.
 *
 * Adds dev-server middleware that spawns agents/ai-diagnostics/agent.mjs
 * and streams JSON progress lines via SSE.
 *
 * Endpoints:
 *   POST /api/audit/start  → SSE stream of agent JSON messages
 *   POST /api/audit/cancel → kills running agent
 *   GET  /api/audit/health → { ok: true } (used by daemon-online check)
 */

import { spawn, type ChildProcess } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Plugin, ViteDevServer } from 'vite';

export function auditPlugin(): Plugin {
  let agentProcess: ChildProcess | null = null;

  return {
    name: 'chaika-local-audit',
    configureServer(server: ViteDevServer) {
      const pluginDir = typeof __dirname !== 'undefined'
        ? __dirname
        : dirname(fileURLToPath(import.meta.url));
      const projectRoot = resolve(pluginDir, '../..');

      // Single middleware that routes all /api/audit/* requests
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';

        // ── GET /api/audit/health ──
        if (url === '/api/audit/health' && (!req.method || req.method === 'GET')) {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, pid: process.pid, at: Date.now() }));
          return;
        }

        // ── POST /api/audit/cancel ──
        if (url === '/api/audit/cancel' && req.method === 'POST') {
          res.setHeader('Content-Type', 'application/json');
          if (agentProcess) {
            agentProcess.kill('SIGTERM');
            agentProcess = null;
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.end(JSON.stringify({ ok: false, error: 'No audit running' }));
          }
          return;
        }

        // ── POST /api/audit/start ──
        if (url === '/api/audit/start' && req.method === 'POST') {
          if (agentProcess) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 409;
            res.end(JSON.stringify({ error: 'Audit already running' }));
            return;
          }

          // SSE headers
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          const agentScript = resolve(projectRoot, 'agents/ai-diagnostics/agent.mjs');

          agentProcess = spawn('node', [agentScript, '--root', projectRoot, '--json-output'], {
            cwd: projectRoot,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, FORCE_COLOR: '0' },
          });

          const send = (data: unknown) => {
            try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ }
          };

          let buffer = '';
          agentProcess.stdout?.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const msg = JSON.parse(line);
                send(msg);
              } catch {
                send({ type: 'log', message: line, severity: 'info', scanner: 'agent' });
              }
            }
          });

          agentProcess.stderr?.on('data', (chunk: Buffer) => {
            const text = chunk.toString().trim();
            if (text) send({ type: 'log', message: text, severity: 'warn', scanner: 'agent-stderr' });
          });

          agentProcess.on('close', (code) => {
            send({ type: 'stream-end', code });
            try { res.end(); } catch { /* ok */ }
            agentProcess = null;
          });

          agentProcess.on('error', (err) => {
            send({ type: 'error', message: err.message });
            try { res.end(); } catch { /* ok */ }
            agentProcess = null;
          });

          req.on('close', () => { /* let agent keep running */ });
          return;
        }

        // Not our route — pass through
        next();
      });
    },
  };
}
