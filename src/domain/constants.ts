// src/domain/constants.ts
// Constants and thresholds for deterministic analytical model

import type { ShadowSignalConfig, NeitherHeuristicConfig } from './types.js';

// ─── Shadow Signal Thresholds ─────────────────────────────────────────────────

/**
 * Default thresholds for shadow usage signal detection.
 * These are conservative defaults — can be overridden in config.
 */
export const DEFAULT_SHADOW_THRESHOLDS = {
  /** Minimum files for 'reusable-local' signal */
  REUSABLE_FILE_THRESHOLD: 2,

  /** Minimum routes for 'multi-route' signal */
  MULTI_ROUTE_THRESHOLD: 2,

  /** Minimum JSX elements for 'substantial-markup' signal */
  SUBSTANTIAL_MARKUP_THRESHOLD: 5,

  /** Maximum JSX elements for utility-like components */
  UTILITY_MARKUP_THRESHOLD: 2,
} as const;

/**
 * Default shadow signal configuration.
 */
export const DEFAULT_SHADOW_SIGNALS: ShadowSignalConfig[] = [
  {
    type: 'reusable-local',
    enabled: true,
    threshold: DEFAULT_SHADOW_THRESHOLDS.REUSABLE_FILE_THRESHOLD,
    minStrength: 'strong',
  },
  {
    type: 'multi-route',
    enabled: true,
    threshold: DEFAULT_SHADOW_THRESHOLDS.MULTI_ROUTE_THRESHOLD,
    minStrength: 'strong',
  },
  {
    type: 'ui-family',
    enabled: true,
    minStrength: 'moderate',
  },
  {
    type: 'substantial-markup',
    enabled: true,
    threshold: DEFAULT_SHADOW_THRESHOLDS.SUBSTANTIAL_MARKUP_THRESHOLD,
    minStrength: 'moderate',
  },
  {
    type: 'parallel-layer',
    enabled: true,
    minStrength: 'moderate',
  },
  {
    type: 'primitive-like',
    enabled: true,
    minStrength: 'weak',
  },
];

// ─── Neither Heuristic Patterns ───────────────────────────────────────────────

/**
 * Patterns for detecting utility/business wrapper components.
 */
export const DEFAULT_NEITHER_HEURISTICS: NeitherHeuristicConfig[] = [
  {
    name: 'utility-pattern',
    enabled: true,
    patterns: [
      /Provider$/i,
      /Context$/i,
      /Hook$/i,
      /use[A-Z]/, // Hook naming convention
      /Container$/i,
      /Wrapper$/i, // Generic wrapper (may need refinement)
    ],
  },
  {
    name: 'data-component',
    enabled: true,
    patterns: [
      /Query$/i,
      /Mutation$/i,
      /Fetcher$/i,
      /Loader$/i, // Data loader
      /Data$/i,
    ],
    maxJsxElements: 2, // Mostly renders children or loading state
  },
  {
    name: 'layout-wrapper',
    enabled: true,
    patterns: [
      /Layout$/i,
      /Page$/i, // Page wrapper
      /Template$/i,
      /Shell$/i,
    ],
    maxJsxElements: 3,
  },
];

// ─── Primitive Component Patterns ─────────────────────────────────────────────

/**
 * Patterns for detecting primitive-like component names.
 * These suggest UI primitive nature (weak signal).
 */
export const PRIMITIVE_NAME_PATTERNS = [
  /^Button/i,
  /^Input/i,
  /^Select/i,
  /^Checkbox/i,
  /^Radio/i,
  /^Switch/i,
  /^Text/i,
  /^Heading/i,
  /^Label/i,
  /^Icon/i,
  /^Avatar/i,
  /^Badge/i,
  /^Tag/i,
  /^Card/i,
  /^Modal/i,
  /^Dialog/i,
  /^Tooltip/i,
  /^Popover/i,
  /^Menu/i,
  /^Tab/i,
  /^Panel/i,
  /^Divider/i,
  /^Spacer/i,
  /^Stack/i,
  /^Flex/i,
  /^Grid/i,
  /^Box/i,
];

// ─── Route Resolution Patterns ────────────────────────────────────────────────

/**
 * Next.js pages directory patterns.
 */
export const NEXTJS_PAGES_PATTERNS = {
  /** Direct page files */
  pageFiles: /[\\/]pages[\\/](?!api[\\/]).*\.(tsx|jsx|ts|js)$/,

  /** Index files */
  indexFiles: /[\\/]pages[\\/]index\.(tsx|jsx|ts|js)$/,

  /** Dynamic route segments */
  dynamicSegment: /\[(?:\.{3})?([^\]]+)\]/g,

  /** Catch-all segments */
  catchAllSegment: /\[\.{3}[^\]]+\]/,
} as const;

/**
 * Next.js app directory patterns.
 */
export const NEXTJS_APP_PATTERNS = {
  /** Page files in app directory */
  pageFiles: /[\\/]app[\\/](?!.*\(.*?\).*[\\/]).*page\.(tsx|jsx|ts|js)$/,

  /** Route groups (ignored in path) */
  routeGroup: /\([^)]+\)/,

  /** Layout files */
  layoutFiles: /[\\/]app[\\/].*layout\.(tsx|jsx|ts|js)$/,
} as const;

/**
 * React Router config file patterns.
 */
export const REACT_ROUTER_PATTERNS = {
  configFiles: /\.(routes|router)\.(ts|tsx|js|jsx)$/,
  routeConfig: /routes\s*[=:]\s*\[/,
} as const;

// ─── Classification Priority ──────────────────────────────────────────────────

/**
 * Priority order for classification sources.
 * Higher number = higher priority (wins in conflicts).
 */
export const CLASSIFICATION_SOURCE_PRIORITY: Record<string, number> = {
  'direct-ds': 100,
  'ds-backed-wrapper': 90,
  'transitive-declared': 80,
  'transitive-auto': 70,
  'utility-heuristic': 60,
  'local-ui-signal': 50,
  'unclassified': 0,
};

// ─── Report Version ───────────────────────────────────────────────────────────

export const REPORT_VERSION = '2.0' as const;

// ─── Formula Templates ────────────────────────────────────────────────────────

/**
 * Human-readable formula templates for metrics.
 */
export const FORMULAS = {
  directAdoption:
    'Direct Adoption = Direct DS Instances / (Adoption + Shadow + Neither) × 100',
  effectiveAdoptionProxy:
    'Effective Adoption Proxy = (Direct DS + Weighted DS-backed Wrappers) / Denominator × 100',
  shadowUsageProxy: 'Shadow Usage Proxy = Shadow Instances / Denominator × 100',
  bucketPercentage: '{bucket} % = {bucket} Instances / Total Classified × 100',
} as const;

// ─── Denominator Explanation ──────────────────────────────────────────────────

export const DENOMINATOR_EXPLANATION =
  'Adoption + Shadow + Neither (excluding HTML native and non-UI third-party)';
