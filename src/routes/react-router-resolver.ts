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
import { readTsConfigPaths, resolveAliasPath, type TsConfigPaths } from '../scanner/tsconfig-paths.js';

type Confidence = 'high' | 'medium' | 'low';

const RESOLVE_EXTS = [
  '.tsx', '.ts', '.jsx', '.js',
  '/index.tsx', '/index.ts', '/index.jsx', '/index.js',
];

const ROUTER_FACTORY_RE = /^create(Browser|Hash|Memory|Static)Router$/;

/** Maps localName → { filePath, exportedName } for named imports from relative paths. */
type NamedImportMap = Map<string, { filePath: string; exportedName: string }>;

// ─── Resolver ─────────────────────────────────────────────────────────────────

export class ReactRouterResolver implements RouteResolver {
  readonly name = 'react-router';
  readonly priority = 110; // Above nextjs (100): explicit router config beats file-system inference

  private fileToRoute = new Map<string, { routeId: string; confidence: Confidence }>();
  private repoPath = '';
  private tsConfigPaths: TsConfigPaths | null = null;

  async detect(repoPath: string): Promise<boolean> {
    this.repoPath = repoPath;
    this.fileToRoute.clear();
    this.tsConfigPaths = readTsConfigPaths(repoPath);

    if (!hasReactRouterDep(repoPath)) {
      if (process.env.DS_SCANNER_DEBUG) {
        console.log(`[react-router-resolver] No react-router dependency in ${repoPath}`);
      }
      return false;
    }

    const routeFiles = findRouteConfigFiles(repoPath);
    if (process.env.DS_SCANNER_DEBUG) {
      console.log(`[react-router-resolver] Found ${routeFiles.length} route candidate files in ${repoPath}`);
      for (const f of routeFiles) console.log(`  - ${path.relative(repoPath, f)}`);
    }

    for (const f of routeFiles) {
      this.parseRouteFile(f);
    }

    if (process.env.DS_SCANNER_DEBUG) {
      console.log(`[react-router-resolver] Extracted ${this.fileToRoute.size} route mappings`);
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
    const tsPaths = this.tsConfigPaths;

    // Build import map: localName → absolute file path (static + lazy)
    const importMap = buildImportMap(ast, dir, tsPaths);

    // Build variable map: varName → AST node (for route arrays passed by name)
    const varMap = buildVariableMap(ast);

    // Build named import map: localName → { filePath, exportedName } for cross-file resolution
    const namedImportMap = buildNamedImportMap(ast, dir, tsPaths);

    // Extract from createBrowserRouter/createHashRouter etc.
    this.extractV6Routes(ast, importMap, varMap, namedImportMap);

    // Extract from JSX <Route> elements
    this.extractJSXRoutes(ast, importMap);
  }

  // ── V6 data-API routes ───────────────────────────────────────────────────────

  private extractV6Routes(
    ast: TSESTree.Program,
    importMap: Map<string, string>,
    varMap: Map<string, TSESTree.Expression>,
    namedImportMap: NamedImportMap
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
        // createBrowserRouter(routes) — local variable
        routesNode = varMap.get(firstArg.name) ?? null;

        // createBrowserRouter(importedRoutes) — cross-file named import
        if (!routesNode) {
          const named = namedImportMap.get(firstArg.name);
          if (named) {
            this.resolveImportedRouteArray(named.filePath, named.exportedName, '', new Set());
            return;
          }
        }
      }

      if (routesNode?.type === 'ArrayExpression') {
        this.walkRouteObjects(routesNode.elements, importMap, varMap, namedImportMap, '', new Set());
      }
    });
  }

  private walkRouteObjects(
    elements: (TSESTree.Expression | TSESTree.SpreadElement | null)[],
    importMap: Map<string, string>,
    varMap: Map<string, TSESTree.Expression>,
    namedImportMap: NamedImportMap,
    pathPrefix: string,
    visited: Set<string>
  ): void {
    for (const el of elements) {
      if (!el) continue;

      // Handle spread elements: [...metricsRoutes, ...dashboardRoutes]
      if (el.type === 'SpreadElement') {
        const arg = el.argument;
        if (arg.type === 'Identifier') {
          // Local variable spread: const allRoutes = [...]; [...allRoutes]
          const localVar = varMap.get(arg.name);
          if (localVar?.type === 'ArrayExpression') {
            this.walkRouteObjects(localVar.elements, importMap, varMap, namedImportMap, pathPrefix, visited);
          } else {
            // Cross-file spread: import { metricsRoutes } from './metrics-routes'
            const named = namedImportMap.get(arg.name);
            if (named) {
              const key = `${named.filePath}::${named.exportedName}`;
              if (!visited.has(key)) {
                visited.add(key);
                this.resolveImportedRouteArray(named.filePath, named.exportedName, pathPrefix, visited);
              }
            }
          }
        }
        continue;
      }

      if (el.type !== 'ObjectExpression') continue;

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

          // Handle <Navigate to="..." /> and <Redirect path="..." /> as redirect routes
          if (!componentName && prop.value.type === 'JSXElement') {
            const tag = prop.value.openingElement.name;
            if (tag.type === 'JSXIdentifier') {
              const tagName = tag.name;
              if (tagName === 'Navigate') {
                const navigateTo = extractNavigateTarget(prop.value);
                if (navigateTo) {
                  this.registerRoute(
                    `redirect://navigate/${fullPath ?? routePathSeg ?? '/'}`,
                    fullPath || routePathSeg || '/',
                    'medium'
                  );
                }
              } else if (tagName === 'Redirect') {
                const redirectTarget = extractRedirectTarget(prop.value);
                if (redirectTarget) {
                  this.registerRoute(
                    `redirect://redirect/${fullPath ?? routePathSeg ?? '/'}`,
                    fullPath || routePathSeg || '/',
                    'medium'
                  );
                }
              }
            }
          }
        }

        if (key === 'component' || key === 'Component') {
          componentName = identifierName(prop.value);
        }

        if (key === 'children') {
          if (prop.value.type === 'ArrayExpression') {
            childrenElements = prop.value.elements;
          } else if (prop.value.type === 'Identifier') {
            // children: localVar
            const childVar = varMap.get(prop.value.name);
            if (childVar?.type === 'ArrayExpression') {
              childrenElements = childVar.elements;
            } else {
              // children: importedRoutes — resolve cross-file
              const named = namedImportMap.get(prop.value.name);
              if (named) {
                const key = `${named.filePath}::${named.exportedName}`;
                if (!visited.has(key)) {
                  visited.add(key);
                  this.resolveImportedRouteArray(named.filePath, named.exportedName,
                    joinRoutePaths(pathPrefix, routePathSeg ?? ''), visited);
                }
              }
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
        this.walkRouteObjects(childrenElements, importMap, varMap, namedImportMap, fullPath, visited);
      }
    }
  }

  // ── Cross-file route resolution ──────────────────────────────────────────────

  /**
   * Parse a separate route file and extract routes from a named export.
   * Handles: export const metricsRoutes = [{path, element, children}, ...]
   */
  private resolveImportedRouteArray(
    filePath: string,
    exportedName: string,
    pathPrefix: string,
    visited: Set<string>
  ): void {
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
    const tsPaths = this.tsConfigPaths;
    const importMap = buildImportMap(ast, dir, tsPaths);
    const varMap = buildVariableMap(ast);
    const namedImportMap = buildNamedImportMap(ast, dir, tsPaths);

    const array = findExportedArray(ast, exportedName, varMap);
    if (array) {
      this.walkRouteObjects(array.elements, importMap, varMap, namedImportMap, pathPrefix, visited);
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
function buildImportMap(
  ast: TSESTree.Program,
  dir: string,
  tsPaths: TsConfigPaths | null
): Map<string, string> {
  const map = new Map<string, string>();

  for (const node of ast.body) {
    // Static imports
    if (node.type === 'ImportDeclaration') {
      const src = node.source.value as string;
      const resolved = resolveImportPath(src, dir, tsPaths);
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
        if (!lazyPath) continue;
        const resolved = resolveImportPath(lazyPath, dir, tsPaths);
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

// ─── Named import map ─────────────────────────────────────────────────────────

/**
 * Build a map of localName → { filePath, exportedName } for named ImportSpecifiers
 * from relative paths only. Used to resolve cross-file route arrays.
 *
 * import { metricsRoutes } from './metrics-routes'
 *   → 'metricsRoutes' → { filePath: '/abs/metrics-routes.tsx', exportedName: 'metricsRoutes' }
 *
 * import { metricsRoutes as mr } from './metrics-routes'
 *   → 'mr' → { filePath: '/abs/metrics-routes.tsx', exportedName: 'metricsRoutes' }
 */
function buildNamedImportMap(
  ast: TSESTree.Program,
  dir: string,
  tsPaths: TsConfigPaths | null
): NamedImportMap {
  const map: NamedImportMap = new Map();

  for (const node of ast.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const src = node.source.value as string;
    const resolved = resolveImportPath(src, dir, tsPaths);
    if (!resolved) continue;

    for (const spec of node.specifiers) {
      if (spec.type !== 'ImportSpecifier') continue;
      const exportedName =
        spec.imported.type === 'Identifier'
          ? spec.imported.name
          : (spec.imported as TSESTree.StringLiteral).value;
      map.set(spec.local.name, { filePath: resolved, exportedName });
    }
  }

  return map;
}

// ─── Exported array finder ────────────────────────────────────────────────────

/**
 * Find an exported array expression by its exported name in a parsed AST.
 * Handles:
 *   export const metricsRoutes = [...]
 *   const metricsRoutes = [...]; export { metricsRoutes }
 *   const inner = [...]; export { inner as metricsRoutes }
 */
function findExportedArray(
  ast: TSESTree.Program,
  exportedName: string,
  varMap: Map<string, TSESTree.Expression>
): TSESTree.ArrayExpression | null {
  for (const node of ast.body) {
    // export const metricsRoutes = [...]
    if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      const decl = node.declaration;
      if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          if (
            d.id.type === 'Identifier' &&
            d.id.name === exportedName &&
            d.init?.type === 'ArrayExpression'
          ) {
            return d.init;
          }
        }
      }
    }

    // export { metricsRoutes } or export { inner as metricsRoutes }
    if (node.type === 'ExportNamedDeclaration' && !node.declaration) {
      for (const spec of node.specifiers) {
        if (spec.type !== 'ExportSpecifier') continue;
        const expName =
          spec.exported.type === 'Identifier'
            ? spec.exported.name
            : (spec.exported as TSESTree.StringLiteral).value;
        if (expName !== exportedName) continue;

        const localVar = varMap.get(spec.local.name);
        if (localVar?.type === 'ArrayExpression') return localVar;
      }
    }
  }

  return null;
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

    const segments = f.split(path.sep);
    const isInRoutesDir = segments.some(
      seg => seg === 'routes' || seg === 'router' || seg === 'navigation'
    );
    const isFeatureRoutes =
      segments.includes('features') && /\.routes?\.(tsx?|jsx?)$/.test(base);
    const isCandidate =
      base.startsWith('route') ||
      base.startsWith('router') ||
      base === 'app.tsx' ||
      base === 'app.ts' ||
      base === 'app.jsx' ||
      base === 'app.js' ||
      isInRoutesDir ||
      isFeatureRoutes;

    if (!isCandidate) return;

    try {
      const content = fs.readFileSync(f, 'utf-8');
      // Files that directly import react-router are always candidates
      if (content.includes('react-router')) {
        results.push(f);
        return;
      }

      // For route-config files in known directories or with known names,
      // do a lightweight AST check for route-object shape instead of
      // requiring the react-router string.
      if (isInRoutesDir || isFeatureRoutes || base.endsWith('-routes.tsx') || base.endsWith('-routes.ts') || base.endsWith('-paths.tsx') || base.endsWith('-paths.ts')) {
        if (looksLikeRouteConfig(content)) {
          results.push(f);
        }
      }
    } catch {
      /* ignore */
    }
  }, 5);

  return results;
}

/**
 * Lightweight AST check: does the file contain object literals with
 * both `path` and (`element` or `children`) properties?
 * This catches exported RouteObject arrays without requiring react-router imports.
 */
function looksLikeRouteConfig(code: string): boolean {
  try {
    const ast = parse(code, {
      jsx: true,
      loc: false,
      range: false,
      tokens: false,
      comment: false,
      errorOnUnknownASTType: false,
    });

    let found = false;
    walkAST(ast, (node) => {
      if (found) return;
      if (node.type !== 'ObjectExpression') return;

      let hasPath = false;
      let hasElementOrChildren = false;
      for (const prop of node.properties) {
        if (prop.type !== 'Property') continue;
        const key = propKeyName(prop.key);
        if (key === 'path') hasPath = true;
        if (key === 'element' || key === 'children') hasElementOrChildren = true;
      }
      if (hasPath && hasElementOrChildren) {
        found = true;
      }
    });
    return found;
  } catch {
    return false;
  }
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

function resolveImportPath(
  specifier: string,
  dir: string,
  tsPaths: TsConfigPaths | null
): string | null {
  // Relative imports
  if (specifier.startsWith('.')) {
    const base = path.resolve(dir, specifier);
    if (fs.existsSync(base) && !fs.statSync(base).isDirectory()) return base;
    for (const ext of RESOLVE_EXTS) {
      const candidate = base + ext;
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  // Absolute imports (already absolute path)
  if (specifier.startsWith('/')) {
    if (fs.existsSync(specifier) && !fs.statSync(specifier).isDirectory()) return specifier;
    for (const ext of RESOLVE_EXTS) {
      const candidate = specifier + ext;
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  // Path aliases via tsconfig
  if (tsPaths) {
    const aliasResolved = resolveAliasPath(specifier, tsPaths);
    if (aliasResolved) return aliasResolved;
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

/** Extract `to` attribute from <Navigate to="/path" /> or <Navigate to={expr} />. */
function extractNavigateTarget(node: TSESTree.Expression): string | null {
  if (node.type !== 'JSXElement') return null;
  const tag = node.openingElement.name;
  if (tag.type !== 'JSXIdentifier' || tag.name !== 'Navigate') return null;

  for (const attr of node.openingElement.attributes) {
    if (attr.type !== 'JSXAttribute') continue;
    const attrName = attr.name.type === 'JSXIdentifier' ? attr.name.name : null;
    if (attrName !== 'to') continue;

    // String literal: to="/path"
    if (attr.value?.type === 'Literal' && typeof attr.value.value === 'string') {
      return attr.value.value;
    }
    // Expression container: to={"/path"}
    if (attr.value?.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression;
      if (expr.type !== 'JSXEmptyExpression' && expr.type === 'Literal' && typeof expr.value === 'string') {
        return expr.value;
      }
    }
  }
  return null;
}

/** Extract `path` attribute from <Redirect path="/target" />. */
function extractRedirectTarget(node: TSESTree.Expression): string | null {
  if (node.type !== 'JSXElement') return null;
  const tag = node.openingElement.name;
  if (tag.type !== 'JSXIdentifier' || tag.name !== 'Redirect') return null;

  for (const attr of node.openingElement.attributes) {
    if (attr.type !== 'JSXAttribute') continue;
    const attrName = attr.name.type === 'JSXIdentifier' ? attr.name.name : null;
    if (attrName !== 'path') continue;

    if (attr.value?.type === 'Literal' && typeof attr.value.value === 'string') {
      return attr.value.value;
    }
    if (attr.value?.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression;
      if (expr.type !== 'JSXEmptyExpression' && expr.type === 'Literal' && typeof expr.value === 'string') {
        return expr.value;
      }
    }
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
