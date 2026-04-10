// src/routes/fallback-resolver.ts
// Fallback directory-based route resolver

import type { RouteResolver } from './types.js';
import type { RouteMatch } from '../domain/types.js';
import { dirname, relative, sep } from 'path';

/**
 * Fallback resolver that groups files by directory structure.
 * Used when no framework-specific resolver matches.
 */
export class FallbackResolver implements RouteResolver {
  readonly name = 'fallback';
  readonly priority = 0;

  private repoPath: string = '';
  private boundaryDirs: string[];

  constructor(boundaryDirs: string[] = ['pages', 'routes', 'views', 'screens', 'features']) {
    this.boundaryDirs = boundaryDirs;
  }

  async detect(repoPath: string): Promise<boolean> {
    this.repoPath = repoPath;
    // Fallback resolver always applies
    return true;
  }

  async resolve(filePath: string): Promise<RouteMatch | null> {
    // Get relative path from repo root
    const relPath = relative(this.repoPath, filePath);

    // Find the first boundary directory
    const parts = relPath.split(sep);
    let boundaryIndex = -1;

    for (let i = 0; i < parts.length; i++) {
      if (this.boundaryDirs.includes(parts[i])) {
        boundaryIndex = i;
        break;
      }
    }

    // If no boundary found, use the first directory after src/ or root
    if (boundaryIndex === -1) {
      const srcIndex = parts.indexOf('src');
      boundaryIndex = srcIndex >= 0 ? srcIndex + 1 : 0;
    }

    // Extract route key from boundary onwards
    const routeParts = parts.slice(boundaryIndex);

    // Remove file extension
    const lastPart = routeParts[routeParts.length - 1];
    routeParts[routeParts.length - 1] = lastPart.replace(/\.(tsx|jsx|ts|js)$/, '');

    // Skip index files (they belong to parent route)
    if (routeParts[routeParts.length - 1] === 'index') {
      routeParts.pop();
    }

    // Build route ID
    const routeKey = routeParts.join('/');
    const routeId = '/' + routeKey;

    return {
      routeId,
      routeKey,
      filePath,
      confidence: 'low',
      source: 'fallback-directory',
      pattern: this.boundaryDirs.find(d => parts.includes(d)),
    };
  }
}

/**
 * Simple path-based resolver with custom patterns.
 */
export class PatternResolver implements RouteResolver {
  readonly name = 'pattern';
  readonly priority = 50;

  private repoPath: string = '';
  private patterns: { test: RegExp; extract: (path: string) => string }[];

  constructor(patterns: { test: RegExp; extract: (path: string) => string }[]) {
    this.patterns = patterns;
  }

  async detect(repoPath: string): Promise<boolean> {
    this.repoPath = repoPath;
    return this.patterns.length > 0;
  }

  async resolve(filePath: string): Promise<RouteMatch | null> {
    const relPath = relative(this.repoPath, filePath);

    for (const pattern of this.patterns) {
      if (pattern.test.test(filePath)) {
        const routeId = pattern.extract(relPath);
        return {
          routeId,
          routeKey: relPath,
          filePath,
          confidence: 'medium',
          source: 'path-pattern',
          pattern: pattern.test.source,
        };
      }
    }

    return null;
  }
}
