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
