// src/routes/types.ts
// Route resolution types

import type { RouteMatch } from '../domain/types.js';

// ─── Route Resolver Interface ─────────────────────────────────────────────────

/**
 * Interface for framework-specific route resolvers.
 * Implement this to add support for new frameworks.
 */
export interface RouteResolver {
  /** Unique resolver name */
  readonly name: string;

  /** Priority order — higher number = tried first */
  readonly priority: number;

  /**
   * Detect if this resolver applies to the given repository.
   * Called once per repository during initialization.
   */
  detect(repoPath: string): Promise<boolean>;

  /**
   * Resolve route for a specific file.
   * Returns null if file doesn't represent a route.
   */
  resolve(filePath: string): Promise<RouteMatch | null>;
}

// ─── Resolver Registry ────────────────────────────────────────────────────────

/**
 * Registry of available route resolvers.
 */
export interface ResolverRegistry {
  /** All registered resolvers */
  resolvers: RouteResolver[];

  /** Resolver selected for current repository */
  activeResolver: RouteResolver | null;

  /** Whether route resolution is available */
  canResolve: boolean;
}

// ─── Route Extraction Result ──────────────────────────────────────────────────

/**
 * Result of route extraction for a file.
 */
export interface RouteExtractionResult {
  filePath: string;
  routeMatch: RouteMatch | null;
  resolverUsed: string;
  fallback: boolean;
}

// ─── Route Aggregation ────────────────────────────────────────────────────────

/**
 * Aggregated route information across files.
 */
export interface RouteAggregate {
  routeId: string;
  routeKey: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
  filePaths: string[];
  fileCount: number;
}

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Route resolution configuration.
 */
export interface RouteResolutionConfig {
  /** Enable route resolution */
  enabled: boolean;

  /** Preferred resolver (auto-detect if not specified) */
  preferredResolver?: string;

  /** Custom patterns for path-based resolution */
  customPatterns?: {
    test: RegExp;
    extract: (filePath: string) => string;
  }[];

  /** Enable fallback directory-based resolution */
  enableFallback: boolean;

  /** Directories to treat as route boundaries in fallback mode */
  fallbackBoundaryDirs?: string[];
}

// ─── Route Resolution Error ───────────────────────────────────────────────────

/**
 * Error during route resolution.
 */
export class RouteResolutionError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly resolverName: string
  ) {
    super(message);
    this.name = 'RouteResolutionError';
  }
}
