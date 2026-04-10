// src/routes/nextjs-resolver.ts
// Next.js pages/ and app/ directory route resolver

import type { RouteResolver } from './types.js';
import type { RouteMatch } from '../domain/types.js';
import { NEXTJS_PAGES_PATTERNS, NEXTJS_APP_PATTERNS } from '../domain/constants.js';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Next.js route resolver — supports both pages/ and app/ directories.
 */
export class NextJsResolver implements RouteResolver {
  readonly name = 'nextjs';
  readonly priority = 100;

  private hasPagesDir: boolean = false;
  private hasAppDir: boolean = false;
  private repoPath: string = '';

  async detect(repoPath: string): Promise<boolean> {
    this.repoPath = repoPath;

    // Check for pages directory
    const pagesPath = join(repoPath, 'pages');
    this.hasPagesDir = existsSync(pagesPath);

    // Check for app directory
    const appPath = join(repoPath, 'app');
    this.hasAppDir = existsSync(appPath);

    return this.hasPagesDir || this.hasAppDir;
  }

  async resolve(filePath: string): Promise<RouteMatch | null> {
    // Try pages directory first
    if (this.hasPagesDir) {
      const pagesMatch = this.resolvePagesRoute(filePath);
      if (pagesMatch) return pagesMatch;
    }

    // Try app directory
    if (this.hasAppDir) {
      const appMatch = this.resolveAppRoute(filePath);
      if (appMatch) return appMatch;
    }

    return null;
  }

  /**
   * Resolve route for pages directory structure.
   */
  private resolvePagesRoute(filePath: string): RouteMatch | null {
    if (!NEXTJS_PAGES_PATTERNS.pageFiles.test(filePath)) {
      return null;
    }

    // Extract path relative to pages directory
    const pagesIndex = filePath.indexOf(`${this.repoPath}pages`);
    if (pagesIndex === -1) return null;

    const relativePath = filePath.slice(pagesIndex + this.repoPath.length + 6); // +6 for 'pages/'

    // Remove file extension
    const withoutExt = relativePath.replace(/\.(tsx|jsx|ts|js)$/, '');

    // Handle index files
    if (withoutExt === 'index') {
      return {
        routeId: '/',
        routeKey: 'pages/index',
        filePath,
        confidence: 'high',
        source: 'nextjs-pages',
        pattern: '/',
      };
    }

    // Convert file path to route path
    let routePath = '/' + withoutExt.replace(/\\/g, '/');

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
    if (!NEXTJS_APP_PATTERNS.pageFiles.test(filePath)) {
      return null;
    }

    // Extract path relative to app directory
    const appIndex = filePath.indexOf(`${this.repoPath}app`);
    if (appIndex === -1) return null;

    // Get directory containing page.tsx
    const pageDir = filePath.slice(appIndex + this.repoPath.length + 4); // +4 for 'app/'
    const dirWithoutPage = pageDir.replace(/\/page\.(tsx|jsx|ts|js)$/, '');

    // Remove route groups (parentheses)
    const withoutGroups = dirWithoutPage.replace(NEXTJS_APP_PATTERNS.routeGroup, '');

    // Clean up path
    let routePath = '/' + withoutGroups.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');

    if (routePath === '') {
      routePath = '/';
    }

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
}
