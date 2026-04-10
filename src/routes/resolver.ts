// src/routes/resolver.ts
// Main route resolution orchestrator

import type { RouteResolver, RouteResolutionConfig, RouteExtractionResult } from './types.js';
import type { RouteMatch } from '../domain/types.js';
import { NextJsResolver } from './nextjs-resolver.js';
import { ReactRouterResolver } from './react-router-resolver.js';
import { FallbackResolver, PatternResolver } from './fallback-resolver.js';

/**
 * Route resolution orchestrator.
 * Manages resolver registry and coordinates route extraction.
 */
export class RouteResolutionOrchestrator {
  private resolvers: RouteResolver[] = [];
  private activeResolver: RouteResolver | null = null;
  private config: RouteResolutionConfig;
  private repoPath: string = '';

  constructor(config: RouteResolutionConfig) {
    this.config = config;
    this.initializeResolvers();
  }

  /**
   * Initialize resolvers based on configuration.
   */
  private initializeResolvers(): void {
    // Add framework-specific resolvers
    this.resolvers.push(new NextJsResolver());
    this.resolvers.push(new ReactRouterResolver());

    // Add custom pattern resolver if patterns configured
    if (this.config.customPatterns && this.config.customPatterns.length > 0) {
      this.resolvers.push(new PatternResolver(this.config.customPatterns));
    }

    // Add fallback resolver if enabled
    if (this.config.enableFallback) {
      this.resolvers.push(new FallbackResolver(this.config.fallbackBoundaryDirs));
    }

    // Sort by priority (highest first)
    this.resolvers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Initialize for a repository — detect which resolver to use.
   */
  async initialize(repoPath: string): Promise<boolean> {
    this.repoPath = repoPath;

    if (!this.config.enabled) {
      return false;
    }

    // If preferred resolver specified, try it first
    if (this.config.preferredResolver) {
      const preferred = this.resolvers.find(r => r.name === this.config.preferredResolver);
      if (preferred && (await preferred.detect(repoPath))) {
        this.activeResolver = preferred;
        return true;
      }
    }

    // Try each resolver in priority order
    for (const resolver of this.resolvers) {
      try {
        if (await resolver.detect(repoPath)) {
          this.activeResolver = resolver;
          return true;
        }
      } catch {
        // Continue to next resolver
      }
    }

    // No resolver matched
    this.activeResolver = null;
    return false;
  }

  /**
   * Resolve route for a single file.
   */
  async resolveFile(filePath: string): Promise<RouteExtractionResult> {
    if (!this.config.enabled || !this.activeResolver) {
      return {
        filePath,
        routeMatch: null,
        resolverUsed: 'none',
        fallback: true,
      };
    }

    try {
      const routeMatch = await this.activeResolver.resolve(filePath);

      return {
        filePath,
        routeMatch,
        resolverUsed: this.activeResolver.name,
        fallback: routeMatch?.source === 'fallback-directory',
      };
    } catch {
      // On error, return unmapped
      return {
        filePath,
        routeMatch: null,
        resolverUsed: this.activeResolver.name,
        fallback: true,
      };
    }
  }

  /**
   * Resolve routes for multiple files.
   */
  async resolveFiles(filePaths: string[]): Promise<RouteExtractionResult[]> {
    return Promise.all(filePaths.map(fp => this.resolveFile(fp)));
  }

  /**
   * Get currently active resolver.
   */
  getActiveResolver(): RouteResolver | null {
    return this.activeResolver;
  }

  /**
   * Check if route resolution is available.
   */
  isAvailable(): boolean {
    return this.config.enabled && this.activeResolver !== null;
  }

  /**
   * Get resolution summary for reporting.
   */
  getSummary(): {
    enabled: boolean;
    activeResolver: string | null;
    availableResolvers: string[];
  } {
    return {
      enabled: this.config.enabled,
      activeResolver: this.activeResolver?.name ?? null,
      availableResolvers: this.resolvers.map(r => r.name),
    };
  }
}

/**
 * Aggregate route matches by route ID.
 */
export function aggregateByRoute(
  results: RouteExtractionResult[]
): Map<string, { routeMatch: RouteMatch; files: string[] }> {
  const aggregates = new Map<string, { routeMatch: RouteMatch; files: string[] }>();

  for (const result of results) {
    if (!result.routeMatch) continue;

    const routeId = result.routeMatch.routeId;
    const existing = aggregates.get(routeId);

    if (existing) {
      existing.files.push(result.filePath);
    } else {
      aggregates.set(routeId, {
        routeMatch: result.routeMatch,
        files: [result.filePath],
      });
    }
  }

  return aggregates;
}

/**
 * Create default route resolution configuration.
 */
export function createDefaultRouteConfig(): RouteResolutionConfig {
  return {
    enabled: true,
    enableFallback: true,
    fallbackBoundaryDirs: ['pages', 'routes', 'views', 'screens', 'features', 'app'],
  };
}
