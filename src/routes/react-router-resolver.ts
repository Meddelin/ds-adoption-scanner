// src/routes/react-router-resolver.ts
// React Router v5/v6 route config resolver.
// Supports:
//   - createBrowserRouter / createHashRouter / createMemoryRouter (v6 data API)
//   - JSX <Route path="..." element={<X/>} component={X} /> (v5 + v6)
//   - lazy(() => import('./Page')) component references
//   - routes passed as a named variable to router factories

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { RouteResolver } from './types.js';
import type { RouteMatch } from '../domain/types.js';

type Confidence = 'high' | 'medium' | 'low';

const RESOLVE_EXTS = [
  '.tsx', '.ts', '.jsx', '.js',
  '/index.tsx', '/index.ts', '/index.jsx', '/index.js',
];

const ROUTER_FACTORY_RE = /^create(Browser|Hash|Memory|Static)Router$/;

// ─── Resolver ─────────────────────────────────────────────────────────────────

export class ReactRouterResolver implements RouteResolver {
  readonly name = 'react-router';
  readonly priority = 110; // Above nextjs (100): explicit router config beats file-system inference

  private fileToRoute = new Map<string, { routeId: string; confidence: Confidence }>();
  private repoPath = '';

  async detect(repoPath: string): Promise<boolean> {
    this.repoPath = repoPath;
    this.fileToRoute.clear();

    if (!hasReactRouterDep(repoPath)) return false;

    const routeFiles = findRouteConfigFiles(repoPath);
    for (const f of routeFiles) {
      this.parseRouteFile(f);
    }

    return this.fileToRoute.size > 0;
  }

  async resolve(filePath: string): Promise<RouteMatch | null> {
    const entry = this.fileToRoute.get(path.normalize(filePath));
    if (!entry) return null;

    return {
      routeId: entry.routeId,
      routeKey: entry.routeId,
      filePath,
      confidence: entry.confidence,
      source: 'react-router',
    };
  }

  // ── File parsing ─────────────────────────────────────────────────────────────

  private parseRouteFile(filePath: string): void {
    let code: string;
    try {
      code = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return;
    }

    let ast: TSESTree.Program;
    try {
      ast = parse(code, {
        jsx: true,
        loc: false,
        range: false,
        tokens: false,
        comment: false,
        errorOnUnknownASTType: false,
      });
    } catch {
      return;
    }

    const dir = path.dirname(filePath);

    // Build import map: localName → absolute file path (static + lazy)
    const importMap = buildImportMap(ast, dir);

    // Build variable map: varName → AST node (for route arrays passed by name)
    const varMap = buildVariableMap(ast);

    // Extract from createBrowserRouter/createHashRouter etc.
    this.extractV6Routes(ast, importMap, varMap);

    // Extract from JSX <Route> elements
    this.extractJSXRoutes(ast, importMap);
  }

  // ── V6 data-API routes ───────────────────────────────────────────────────────

  private extractV6Routes(
    ast: TSESTree.Program,
    importMap: Map<string, string>,
    varMap: Map<string, TSESTree.Expression>
  ): void {
    walkAST(ast, (node) => {
      if (
        node.type !== 'CallExpression' ||
        node.callee.type !== 'Identifier' ||
        !ROUTER_FACTORY_RE.test(node.callee.name)
      ) {
        return;
      }

      const firstArg = node.arguments[0];
      if (!firstArg) return;

      let routesNode: TSESTree.Expression | null = null;

      if (firstArg.type === 'ArrayExpression') {
        routesNode = firstArg;
      } else if (firstArg.type === 'Identifier') {
        // createBrowserRouter(routes) where routes is declared elsewhere
        routesNode = varMap.get(firstArg.name) ?? null;
      }

      if (routesNode?.type === 'ArrayExpression') {
        this.walkRouteObjects(routesNode.elements, importMap, varMap, '');
      }
    });
  }

  private walkRouteObjects(
    elements: (TSESTree.Expression | TSESTree.SpreadElement | null)[],
    importMap: Map<string, string>,
    varMap: Map<string, TSESTree.Expression>,
    pathPrefix: string
  ): void {
    for (const el of elements) {
      if (!el || el.type !== 'ObjectExpression') continue;

      let routePathSeg: string | null = null;
      let componentName: string | null = null;
      let childrenElements: (TSESTree.Expression | TSESTree.SpreadElement | null)[] | null = null;

      for (const prop of el.properties) {
        if (prop.type !== 'Property') continue;
        const key = propKeyName(prop.key);
        if (!key) continue;

        if (key === 'path') {
          routePathSeg = stringLiteralValue(prop.value);
        }

        if (key === 'element') {
          componentName =
            extractComponentFromJSXExpr(prop.value) ??
            extractComponentFromCreateElement(prop.value);
        }

        if (key === 'component' || key === 'Component') {
          componentName = identifierName(prop.value);
        }

        if (key === 'children') {
          if (prop.value.type === 'ArrayExpression') {
            childrenElements = prop.value.elements;
          } else if (prop.value.type === 'Identifier') {
            const childVar = varMap.get(prop.value.name);
            if (childVar?.type === 'ArrayExpression') {
              childrenElements = childVar.elements;
            }
          }
        }
      }

      const fullPath = joinRoutePaths(pathPrefix, routePathSeg ?? '');

      if (componentName) {
        const resolved = importMap.get(componentName);
        if (resolved) {
          this.registerRoute(resolved, fullPath, 'high');
        }
      }

      if (childrenElements) {
        this.walkRouteObjects(childrenElements, importMap, varMap, fullPath);
      }
    }
  }

  // ── JSX <Route> elements ─────────────────────────────────────────────────────

  private extractJSXRoutes(
    ast: TSESTree.Program,
    importMap: Map<string, string>
  ): void {
    // Two-pass: first collect all Route paths + component names,
    // then register once we have context about nesting.
    // Simplified: flat resolution (nested JSX routes get registered at the found path).
    walkAST(ast, (node) => {
      if (node.type !== 'JSXElement') return;

      const opening = node.openingElement;
      const tagName = jsxTagName(opening.name);
      if (tagName !== 'Route') return;

      let routePath: string | null = null;
      let componentName: string | null = null;

      for (const attr of opening.attributes) {
        if (attr.type !== 'JSXAttribute') continue;
        const attrName = attr.name.type === 'JSXIdentifier' ? attr.name.name : null;
        if (!attrName) continue;

        if (attrName === 'path') {
          routePath = jsxAttrString(attr.value);
        }

        if (attrName === 'element' || attrName === 'component' || attrName === 'Component') {
          componentName = jsxAttrComponent(attr.value);
        }
      }

      if (routePath && componentName) {
        const resolved = importMap.get(componentName);
        if (resolved) {
          this.registerRoute(resolved, routePath, 'high');
        }
      }
    });
  }

  // ── Registration ─────────────────────────────────────────────────────────────

  private registerRoute(filePath: string, routeId: string, confidence: Confidence): void {
    const normalized = path.normalize(filePath);
    if (!this.fileToRoute.has(normalized)) {
      this.fileToRoute.set(normalized, { routeId, confidence });
    }
  }
}

// ─── Import map building ──────────────────────────────────────────────────────

/**
 * Build a map of localName → absolute file path from:
 *  - Static import declarations: import X from './X'
 *  - Lazy imports: const X = lazy(() => import('./X'))
 *  - React.lazy: const X = React.lazy(() => import('./X'))
 */
function buildImportMap(ast: TSESTree.Program, dir: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const node of ast.body) {
    // Static imports
    if (node.type === 'ImportDeclaration') {
      const src = node.source.value as string;
      if (!src.startsWith('.')) continue;
      const resolved = resolveImportPath(src, dir);
      if (!resolved) continue;

      for (const spec of node.specifiers) {
        if (
          spec.type === 'ImportDefaultSpecifier' ||
          spec.type === 'ImportSpecifier' ||
          spec.type === 'ImportNamespaceSpecifier'
        ) {
          map.set(spec.local.name, resolved);
        }
      }
    }

    // Lazy imports: const X = lazy(() => import('./X'))
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (decl.id.type !== 'Identifier') continue;
        const localName = decl.id.name;
        const lazyPath = extractLazyImportPath(decl.init);
        if (!lazyPath || !lazyPath.startsWith('.')) continue;
        const resolved = resolveImportPath(lazyPath, dir);
        if (resolved) map.set(localName, resolved);
      }
    }
  }

  return map;
}

/**
 * Extract the import path from:
 *   lazy(() => import('./X'))
 *   React.lazy(() => import('./X'))
 */
function extractLazyImportPath(node: TSESTree.Expression | null | undefined): string | null {
  if (!node || node.type !== 'CallExpression') return null;

  // Check callee is `lazy` or `React.lazy`
  const isLazy =
    (node.callee.type === 'Identifier' && node.callee.name === 'lazy') ||
    (node.callee.type === 'MemberExpression' &&
      node.callee.object.type === 'Identifier' &&
      node.callee.object.name === 'React' &&
      node.callee.property.type === 'Identifier' &&
      node.callee.property.name === 'lazy');

  if (!isLazy) return null;

  // Argument is an arrow function: () => import('./X')
  const arg = node.arguments[0];
  if (!arg) return null;

  let importCall: TSESTree.Node | null = null;

  if (arg.type === 'ArrowFunctionExpression') {
    // Concise body: () => import('./X')
    importCall = arg.body.type === 'ImportExpression' ? arg.body : null;

    // Block body: () => { return import('./X'); }
    if (!importCall && arg.body.type === 'BlockStatement') {
      for (const stmt of arg.body.body) {
        if (stmt.type === 'ReturnStatement' && stmt.argument?.type === 'ImportExpression') {
          importCall = stmt.argument;
          break;
        }
      }
    }
  }

  if (!importCall || importCall.type !== 'ImportExpression') return null;

  const src = importCall.source;
  if (src.type === 'Literal' && typeof src.value === 'string') return src.value;

  return null;
}

// ─── Variable map building ────────────────────────────────────────────────────

/**
 * Build a map of varName → initializer expression for top-level variable declarations.
 * Used to resolve `createBrowserRouter(routes)` where `routes` is declared separately.
 */
function buildVariableMap(ast: TSESTree.Program): Map<string, TSESTree.Expression> {
  const map = new Map<string, TSESTree.Expression>();

  for (const node of ast.body) {
    if (node.type !== 'VariableDeclaration') continue;
    for (const decl of node.declarations) {
      if (decl.id.type === 'Identifier' && decl.init) {
        map.set(decl.id.name, decl.init);
      }
    }
  }

  return map;
}

// ─── Repo detection ───────────────────────────────────────────────────────────

function hasReactRouterDep(repoPath: string): boolean {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoPath, 'package.json'), 'utf-8')
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    return 'react-router' in all || 'react-router-dom' in all || '@remix-run/router' in all;
  } catch {
    return false;
  }
}

function findRouteConfigFiles(repoPath: string): string[] {
  const results: string[] = [];
  const srcDir = path.join(repoPath, 'src');
  const root = fs.existsSync(srcDir) ? srcDir : repoPath;

  walkDir(root, (f) => {
    const base = path.basename(f).toLowerCase();
    if (!/\.(tsx?|jsx?)$/.test(f)) return;

    const isInRoutesDir = f.split(path.sep).some(seg => seg === 'routes' || seg === 'router');
    const isCandidate =
      base.startsWith('route') ||
      base.startsWith('router') ||
      base === 'app.tsx' ||
      base === 'app.ts' ||
      base === 'app.jsx' ||
      base === 'app.js' ||
      isInRoutesDir;

    if (!isCandidate) return;

    try {
      const content = fs.readFileSync(f, 'utf-8');
      if (content.includes('react-router')) results.push(f);
    } catch {
      /* ignore */
    }
  }, 5);

  return results;
}

function walkDir(dir: string, cb: (f: string) => void, maxDepth: number): void {
  if (maxDepth <= 0) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'build') {
      continue;
    }
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(full, cb, maxDepth - 1);
    else if (e.isFile()) cb(full);
  }
}

// ─── Import path resolution ───────────────────────────────────────────────────

function resolveImportPath(specifier: string, dir: string): string | null {
  const base = path.resolve(dir, specifier);
  if (fs.existsSync(base) && !fs.statSync(base).isDirectory()) return base;
  for (const ext of RESOLVE_EXTS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// ─── AST helpers ─────────────────────────────────────────────────────────────

/** Recursively walk all AST nodes, calling cb on each. */
function walkAST(node: TSESTree.Node, cb: (n: TSESTree.Node) => void): void {
  cb(node);
  for (const key of Object.keys(node) as (keyof TSESTree.Node)[]) {
    // Skip non-node properties
    if (key === 'parent' || key === 'type' || key === 'loc' || key === 'range') continue;
    const child = (node as Record<string, unknown>)[key];
    if (!child || typeof child !== 'object') continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in (item as object)) {
          walkAST(item as TSESTree.Node, cb);
        }
      }
    } else if ('type' in (child as object)) {
      walkAST(child as TSESTree.Node, cb);
    }
  }
}

/** Get property key name from Property key node. */
function propKeyName(key: TSESTree.Expression): string | null {
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return null;
}

/** Extract string literal value, or null. */
function stringLiteralValue(node: TSESTree.Expression): string | null {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

/** Get name of identifier, or null. */
function identifierName(node: TSESTree.Expression): string | null {
  return node.type === 'Identifier' ? node.name : null;
}

/** Get JSX tag name (handle JSXIdentifier only; ignore member expressions). */
function jsxTagName(name: TSESTree.JSXTagNameExpression): string | null {
  if (name.type === 'JSXIdentifier') return name.name;
  return null;
}

/**
 * Extract component name from JSX attribute value.
 * Handles: element={<Dashboard />}  component={Dashboard}
 */
function jsxAttrComponent(
  value: TSESTree.JSXAttribute['value']
): string | null {
  if (!value) return null;
  if (value.type !== 'JSXExpressionContainer') return null;

  const expr = value.expression;
  if (expr.type === 'JSXEmptyExpression') return null;

  if (expr.type === 'Identifier') return expr.name;

  if (expr.type === 'JSXElement') {
    return extractComponentFromJSXExpr(expr);
  }

  return null;
}

/** Extract string value from JSX attribute string literal value. */
function jsxAttrString(
  value: TSESTree.JSXAttribute['value']
): string | null {
  if (!value) return null;
  if (value.type === 'Literal' && typeof value.value === 'string') return value.value;
  if (value.type === 'JSXExpressionContainer') {
    const expr = value.expression;
    if (expr.type !== 'JSXEmptyExpression' && expr.type === 'Literal' && typeof expr.value === 'string') {
      return expr.value;
    }
  }
  return null;
}

/** Extract component name from JSX expression: <Dashboard /> → 'Dashboard'. */
function extractComponentFromJSXExpr(node: TSESTree.Expression): string | null {
  if (node.type === 'JSXElement') {
    const tag = node.openingElement.name;
    if (tag.type === 'JSXIdentifier') return tag.name;
  }
  return null;
}

/** Extract component from React.createElement(Dashboard, ...) → 'Dashboard'. */
function extractComponentFromCreateElement(node: TSESTree.Expression): string | null {
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === 'React' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'createElement'
  ) {
    const first = node.arguments[0];
    if (first?.type === 'Identifier') return first.name;
  }
  return null;
}

/** Join route path segments, preserving absolute paths and avoiding double slashes. */
function joinRoutePaths(prefix: string, segment: string): string {
  if (!segment && !prefix) return '/';
  if (!segment) return prefix || '/';
  if (segment.startsWith('/')) return segment; // absolute path wins
  if (!prefix || prefix === '/') return '/' + segment;
  return prefix.replace(/\/$/, '') + '/' + segment;
}
