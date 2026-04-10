import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RouteResolutionOrchestrator,
  createDefaultRouteConfig,
} from '../../src/routes/resolver.js';

function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-routes-test-'));
  return run(dir).finally(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

describe('RouteResolutionOrchestrator (Next.js)', () => {
  it('resolves pages route in repository root', async () => {
    await withTempDir(async root => {
      const pageFile = path.join(root, 'pages', 'users.tsx');
      fs.mkdirSync(path.dirname(pageFile), { recursive: true });
      fs.writeFileSync(pageFile, 'export default function Users() { return null; }');

      const resolver = new RouteResolutionOrchestrator(createDefaultRouteConfig());
      await resolver.initialize(root);
      const result = await resolver.resolveFile(pageFile);

      expect(result.routeMatch?.routeId).toBe('/users');
      expect(result.routeMatch?.source).toBe('nextjs-pages');
    });
  });

  it('resolves app route with route groups in src/app', async () => {
    await withTempDir(async root => {
      const pageFile = path.join(root, 'src', 'app', '(marketing)', 'dashboard', 'page.tsx');
      fs.mkdirSync(path.dirname(pageFile), { recursive: true });
      fs.writeFileSync(pageFile, 'export default function Dashboard() { return null; }');

      const resolver = new RouteResolutionOrchestrator(createDefaultRouteConfig());
      await resolver.initialize(root);
      const result = await resolver.resolveFile(pageFile);

      expect(result.routeMatch?.routeId).toBe('/dashboard');
      expect(result.routeMatch?.source).toBe('nextjs-app');
    });
  });
});
