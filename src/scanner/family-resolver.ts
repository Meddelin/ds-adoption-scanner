import type { CategorizedUsage, DSCatalog } from '../types.js';
import { buildFamilyLookup } from './ds-prescan.js';

/**
 * Enriches design-system usages with componentFamily assignment.
 *
 * Uses importEntry.importedName (original export name) for catalog lookup,
 * NOT componentName (local JSX alias). This correctly handles renamed imports:
 *   import { EmptyStateError as MyError } from '@ds'
 *   → <MyError /> maps to family "EmptyState", not fails to find "MyError"
 */
export function enrichWithFamily(
  usages: CategorizedUsage[],
  catalog: DSCatalog
): CategorizedUsage[] {
  if (catalog.size === 0) return usages;

  // Build O(1) lookup: dsName → Map<exportedName, familyName>
  const lookup = buildFamilyLookup(catalog);

  return usages.map(usage => {
    if (usage.category !== 'design-system') return usage;
    if (!usage.dsName) return usage;

    const dsLookup = lookup.get(usage.dsName);
    if (!dsLookup) return usage;

    // Prefer importedName (original export) over componentName (local alias)
    const lookupKey = usage.importEntry?.importedName ?? usage.componentName;
    const familyName = dsLookup.get(lookupKey);

    if (!familyName) return usage;

    return { ...usage, componentFamily: familyName };
  });
}
