// src/routes/nextjs-resolver.ts
// Next.js pages/ and app/ directory route resolver

import type { RouteResolver } from './types.js';
import type { RouteMatch } from '../domain/types.js';
import { NEXTJS_PAGES_PATTERNS, NEXTJS_APP_PATTERNS } from '../domain/constants.js';
import { existsSync } from 'fs';
import { join, relative } from 'path';

/**
 * Next.js route resolver - supports both pages/ and app/ directories.
 */
export class NextJsResolver implements RouteResolver {
  readonly name = 'nextjs';
  readonly priority = 100;

  private pagesRoot: string | null = null;
  private appRoot: string | null = null;

  async detect(repoPath: string): Promise<boolean> {
    this.pagesRoot = this.findFirstExistingDir(repoPath, ['pages', join('src', 'pages')]);
    this.appRoot = this.findFirstExistingDir(repoPath, ['app', join('src', 'app')]);
    return this.pagesRoot !== null || this.appRoot !== null;
  }

  async resolve(filePath: string): Promise<RouteMatch | null> {
    // Try pages directory first
    if (this.pagesRoot) {
      const pagesMatch = this.resolvePagesRoute(filePath);
      if (pagesMatch) return pagesMatch;
    }

    // Try app directory
    if (this.appRoot) {
      const appMatch = this.resolveAppRoute(filePath);
      if (appMatch) return appMatch;
    }

    return null;
  }

  /**
   * Resolve route for pages directory structure.
   */
  private resolvePagesRoute(filePath: string): RouteMatch | null {
    if (!this.pagesRoot) {
      return null;
    }

    if (!NEXTJS_PAGES_PATTERNS.pageFiles.test(filePath)) {
      return null;
    }

    // Extract path relative to pages directory
    const relativePath = this.relativeToRoot(filePath, this.pagesRoot);
    if (!relativePath) {
      return null;
    }

    // Remove file extension
    const withoutExt = relativePath.replace(/\.(tsx|jsx|ts|js)$/, '');
    const normalized = withoutExt.replace(/\\/g, '/').replace(/\/index$/, '');
    const routePathBase = normalized === '' || normalized === 'index' ? '/' : `/${normalized}`;
    let routePath = routePathBase;

    // Handle dynamic segments
    const dynamicSegments: string[] = [];
    routePath = routePath.replace(NEXTJS_PAGES_PATTERNS.dynamicSegment, (match, name) => {
      if (match.startsWith('[...')) {
        dynamicSegments.push(`...${name}`);
        return `:${name}*`;
      }
      dynamicSegments.push(name);
      return `:${name}`;
    });

    return {
      routeId: routePath,
      routeKey: `pages/${withoutExt}`,
      filePath,
      confidence: 'high',
      source: 'nextjs-pages',
      pattern: dynamicSegments.length > 0 ? `[${dynamicSegments.join(', ')}]` : undefined,
    };
  }

  /**
   * Resolve route for app directory structure.
   */
  private resolveAppRoute(filePath: string): RouteMatch | null {
    if (!this.appRoot) {
      return null;
    }

    if (!NEXTJS_APP_PATTERNS.pageFiles.test(filePath)) {
      return null;
    }

    const relativePath = this.relativeToRoot(filePath, this.appRoot);
    if (!relativePath) {
      return null;
    }

    // Get directory containing page.tsx
    const dirWithoutPage = relativePath
      .replace(/\\/g, '/')
      .replace(/\/page\.(tsx|jsx|ts|js)$/, '');

    // Remove route groups (parentheses)
    const withoutGroups = dirWithoutPage.replace(/\([^)]+\)/g, '');

    // Clean up path
    const normalizedPath = withoutGroups
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/|\/$/g, '');
    let routePath = normalizedPath ? `/${normalizedPath}` : '/';

    // Handle dynamic segments
    const dynamicSegments: string[] = [];
    routePath = routePath.replace(/\[([^\]]+)\]/g, (match, name) => {
      if (name.startsWith('...')) {
        dynamicSegments.push(name);
        return `:${name.slice(3)}*`;
      }
      dynamicSegments.push(name);
      return `:${name}`;
    });

    return {
      routeId: routePath,
      routeKey: `app/${dirWithoutPage}`,
      filePath,
      confidence: 'high',
      source: 'nextjs-app',
      pattern: dynamicSegments.length > 0 ? `[${dynamicSegments.join(', ')}]` : undefined,
    };
  }

  private findFirstExistingDir(repoPath: string, candidates: string[]): string | null {
    for (const candidate of candidates) {
      const dir = join(repoPath, candidate);
      if (existsSync(dir)) {
        return dir;
      }
    }
    return null;
  }

  private relativeToRoot(filePath: string, root: string): string | null {
    const rel = relative(root, filePath);
    if (!rel || rel.startsWith('..')) {
      return null;
    }
    return rel.replace(/^[/\\]+/, '');
  }
}
