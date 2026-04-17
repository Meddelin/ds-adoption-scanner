import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReactRouterResolver } from '../../src/routes/react-router-resolver.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrr-test-'));
  tmpDirs.push(dir);
  const src = path.join(dir, 'src');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ dependencies: { 'react-router-dom': '^6.0.0' } }),
    'utf-8'
  );
  return dir;
}

function write(repo: string, rel: string, content: string): string {
  const full = path.join(repo, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

// ── createBrowserRouter (v6 data API) ─────────────────────────────────────────

describe('ReactRouterResolver — createBrowserRouter', () => {
  it('resolves inline array routes', async () => {
    const repo = makeRepo();

    write(repo, 'src/pages/Home.tsx', 'export default function Home() { return <div/>; }');
    write(repo, 'src/pages/About.tsx', 'export default function About() { return <div/>; }');
    write(repo, 'src/pages/Dashboard.tsx', 'export default function Dashboard() { return <div/>; }');
    write(repo, 'src/pages/Settings.tsx', 'export default function Settings() { return <div/>; }');

    write(
      repo,
      'src/router.tsx',
      `import { createBrowserRouter } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/about', element: <About /> },
  {
    path: '/dashboard',
    element: <Dashboard />,
    children: [
      { path: 'settings', element: <Settings /> },
    ],
  },
]);`
    );

    const resolver = new ReactRouterResolver();
    const ok = await resolver.detect(repo);
    expect(ok).toBe(true);

    const home = await resolver.resolve(path.join(repo, 'src', 'pages', 'Home.tsx'));
    expect(home?.routeId).toBe('/');
    expect(home?.confidence).toBe('high');

    const about = await resolver.resolve(path.join(repo, 'src', 'pages', 'About.tsx'));
    expect(about?.routeId).toBe('/about');

    const dash = await resolver.resolve(path.join(repo, 'src', 'pages', 'Dashboard.tsx'));
    expect(dash?.routeId).toBe('/dashboard');

    const settings = await resolver.resolve(path.join(repo, 'src', 'pages', 'Settings.tsx'));
    expect(settings?.routeId).toBe('/dashboard/settings');
  });

  it('resolves routes declared as a named variable', async () => {
    const repo = makeRepo();

    write(repo, 'src/pages/Profile.tsx', 'export default function Profile() { return <div/>; }');

    write(
      repo,
      'src/routes.tsx',
      `import { createBrowserRouter } from 'react-router-dom';
import Profile from './pages/Profile';

const routes = [
  { path: '/profile', element: <Profile /> },
];

export default createBrowserRouter(routes);`
    );

    const resolver = new ReactRouterResolver();
    await resolver.detect(repo);

    const profile = await resolver.resolve(path.join(repo, 'src', 'pages', 'Profile.tsx'));
    expect(profile?.routeId).toBe('/profile');
  });

  it('resolves lazy() imports', async () => {
    const repo = makeRepo();

    write(repo, 'src/pages/LazyPage.tsx', 'export default function LazyPage() { return <div/>; }');

    write(
      repo,
      'src/router.tsx',
      `import { createBrowserRouter } from 'react-router-dom';
import { lazy } from 'react';

const LazyPage = lazy(() => import('./pages/LazyPage'));

export const router = createBrowserRouter([
  { path: '/lazy', element: <LazyPage /> },
]);`
    );

    const resolver = new ReactRouterResolver();
    await resolver.detect(repo);

    const lazy = await resolver.resolve(path.join(repo, 'src', 'pages', 'LazyPage.tsx'));
    expect(lazy?.routeId).toBe('/lazy');
  });

  it('resolves cross-file route arrays via named imports', async () => {
    const repo = makeRepo();

    write(repo, 'src/pages/Metrics.tsx', 'export default function Metrics() { return <div/>; }');
    write(repo, 'src/pages/Dashboard.tsx', 'export default function Dashboard() { return <div/>; }');

    write(
      repo,
      'src/navigation/routes/metrics-routes.tsx',
      `import Metrics from '../../pages/Metrics';

export const metricsRoutes = [
  { path: '/metrics', element: <Metrics /> },
];`
    );

    write(
      repo,
      'src/router.tsx',
      `import { createBrowserRouter } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import { metricsRoutes } from './navigation/routes/metrics-routes';

export const router = createBrowserRouter([
  { path: '/dashboard', element: <Dashboard /> },
  ...metricsRoutes,
]);`
    );

    const resolver = new ReactRouterResolver();
    const ok = await resolver.detect(repo);
    expect(ok).toBe(true);

    const metrics = await resolver.resolve(path.join(repo, 'src', 'pages', 'Metrics.tsx'));
    expect(metrics?.routeId).toBe('/metrics');
  });

  it('resolves cross-file route arrays with tsconfig path aliases', async () => {
    const repo = makeRepo();

    // Write tsconfig with path alias
    fs.writeFileSync(
      path.join(repo, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: 'src',
          paths: {
            '@/*': ['*'],
            '@pages/*': ['pages/*'],
          },
        },
      }),
      'utf-8'
    );

    write(repo, 'src/pages/Alerts.tsx', 'export default function Alerts() { return <div/>; }');
    write(repo, 'src/pages/Pager.tsx', 'export default function Pager() { return <div/>; }');

    write(
      repo,
      'src/navigation/routes/alerts-routes.tsx',
      `import Alerts from '@pages/Alerts';

export const alertsRoutes = [
  { path: '/alerts', element: <Alerts /> },
];`
    );

    write(
      repo,
      'src/router.tsx',
      `import { createBrowserRouter } from 'react-router-dom';
import Pager from '@pages/Pager';
import { alertsRoutes } from '@/navigation/routes/alerts-routes';

export const router = createBrowserRouter([
  { path: '/alerts/pager', element: <Pager /> },
  ...alertsRoutes,
]);`
    );

    const resolver = new ReactRouterResolver();
    const ok = await resolver.detect(repo);
    expect(ok).toBe(true);

    const alerts = await resolver.resolve(path.join(repo, 'src', 'pages', 'Alerts.tsx'));
    expect(alerts?.routeId).toBe('/alerts');

    const pager = await resolver.resolve(path.join(repo, 'src', 'pages', 'Pager.tsx'));
    expect(pager?.routeId).toBe('/alerts/pager');
  });

  it('resolves feature-based *.routes.tsx files', async () => {
    const repo = makeRepo();

    write(repo, 'src/features/incidents/pages/List.tsx', 'export default function List() { return <div/>; }');

    write(
      repo,
      'src/features/incidents/incidents.routes.tsx',
      `import List from './pages/List';

export const incidentRoutes = [
  { path: '/incidents', element: <List /> },
];`
    );

    write(
      repo,
      'src/router.tsx',
      `import { createBrowserRouter } from 'react-router-dom';
import { incidentRoutes } from './features/incidents/incidents.routes';

export const router = createBrowserRouter([
  ...incidentRoutes,
]);`
    );

    const resolver = new ReactRouterResolver();
    const ok = await resolver.detect(repo);
    expect(ok).toBe(true);

    const list = await resolver.resolve(path.join(repo, 'src', 'features', 'incidents', 'pages', 'List.tsx'));
    expect(list?.routeId).toBe('/incidents');
  });

  it('resolves routes in navigation/ directory without react-router import', async () => {
    const repo = makeRepo();

    write(repo, 'src/pages/Home.tsx', 'export default function Home() { return <div/>; }');

    // This file does NOT import react-router — it only exports route objects
    write(
      repo,
      'src/navigation/routes/app-routes.tsx',
      `import Home from '../../pages/Home';

export const appRoutes = [
  { path: '/', element: <Home /> },
];`
    );

    write(
      repo,
      'src/navigation/router.tsx',
      `import { createBrowserRouter } from 'react-router-dom';
import { appRoutes } from './routes/app-routes';

export const router = createBrowserRouter(appRoutes);`
    );

    const resolver = new ReactRouterResolver();
    const ok = await resolver.detect(repo);
    expect(ok).toBe(true);

    const home = await resolver.resolve(path.join(repo, 'src', 'pages', 'Home.tsx'));
    expect(home?.routeId).toBe('/');
  });

  it('registers Navigate redirect routes', async () => {
    const repo = makeRepo();

    write(repo, 'src/pages/DefaultPage.tsx', 'export default function DefaultPage() { return <div/>; }');

    write(
      repo,
      'src/router.tsx',
      `import { createBrowserRouter, Navigate } from 'react-router-dom';
import DefaultPage from './pages/DefaultPage';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/default" /> },
  { path: '/default', element: <DefaultPage /> },
]);`
    );

    const resolver = new ReactRouterResolver();
    const ok = await resolver.detect(repo);
    expect(ok).toBe(true);

    // The real page should still resolve (redirect itself has no component file)
    const page = await resolver.resolve(path.join(repo, 'src', 'pages', 'DefaultPage.tsx'));
    expect(page?.routeId).toBe('/default');
  });
});

// ── JSX <Route> (v5 / v6 JSX) ─────────────────────────────────────────────────

describe('ReactRouterResolver — JSX <Route>', () => {
  it('resolves element prop', async () => {
    const repo = makeRepo();

    write(repo, 'src/pages/Users.tsx', 'export default function Users() { return <div/>; }');
    write(repo, 'src/pages/UserDetail.tsx', 'export default function UserDetail() { return <div/>; }');

    write(
      repo,
      'src/App.tsx',
      `import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/users" element={<Users />} />
        <Route path="/users/:id" element={<UserDetail />} />
      </Routes>
    </BrowserRouter>
  );
}`
    );

    const resolver = new ReactRouterResolver();
    await resolver.detect(repo);

    const users = await resolver.resolve(path.join(repo, 'src', 'pages', 'Users.tsx'));
    expect(users?.routeId).toBe('/users');

    const detail = await resolver.resolve(path.join(repo, 'src', 'pages', 'UserDetail.tsx'));
    expect(detail?.routeId).toBe('/users/:id');
  });

  it('resolves v5 component prop', async () => {
    const repo = makeRepo();

    write(repo, 'src/pages/Legacy.tsx', 'export default function Legacy() { return <div/>; }');

    write(
      repo,
      'src/App.tsx',
      `import { BrowserRouter, Switch, Route } from 'react-router-dom';
import Legacy from './pages/Legacy';

export function App() {
  return (
    <BrowserRouter>
      <Switch>
        <Route path="/legacy" component={Legacy} />
      </Switch>
    </BrowserRouter>
  );
}`
    );

    const resolver = new ReactRouterResolver();
    await resolver.detect(repo);

    const legacy = await resolver.resolve(path.join(repo, 'src', 'pages', 'Legacy.tsx'));
    expect(legacy?.routeId).toBe('/legacy');
  });
});

// ── Negative cases ─────────────────────────────────────────────────────────────

describe('ReactRouterResolver — negative cases', () => {
  it('returns false for non-react-router projects', async () => {
    const repo = makeRepo();
    // Overwrite package.json with no react-router
    fs.writeFileSync(
      path.join(repo, 'package.json'),
      JSON.stringify({ dependencies: { react: '^18.0.0' } }),
      'utf-8'
    );

    const resolver = new ReactRouterResolver();
    expect(await resolver.detect(repo)).toBe(false);
  });

  it('returns null for unmapped files', async () => {
    const repo = makeRepo();
    write(repo, 'src/router.tsx', `import { createBrowserRouter } from 'react-router-dom';
export const router = createBrowserRouter([]);`);

    const resolver = new ReactRouterResolver();
    await resolver.detect(repo);

    expect(await resolver.resolve(path.join(repo, 'src', 'pages', 'Unknown.tsx'))).toBeNull();
  });
});
