import type {
  CategorizedUsage,
  CategoryMetrics,
  ComponentStat,
  DSCatalog,
  DesignSystemMetrics,
  FamilyStat,
  ScanMetrics,
} from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';

export function calculateMetrics(
  usages: CategorizedUsage[],
  config: ResolvedConfig,
  filesScanned: number,
  catalog?: DSCatalog
): ScanMetrics {
  // Group usages by category
  const byCategory = groupByCategory(usages);

  const dsUsages = byCategory.get('design-system') ?? [];
  const localLibUsages = byCategory.get('local-library') ?? [];
  const localUsages = byCategory.get('local') ?? [];
  const thirdPartyUsages = byCategory.get('third-party') ?? [];
  const htmlNativeUsages = byCategory.get('html-native') ?? [];

  // Split local into reusable (filesUsedIn >= reusableThreshold) and unique
  const { reusable: localReusableUsages, unique: localUniqueUsages } =
    splitLocalUsages(localUsages, config.reusableThreshold);

  // Direct adoption denominator
  const localInDenominator = config.excludeLocalFromAdoption
    ? 0
    : config.excludeUniqueLocalFromAdoption
      ? localReusableUsages.length
      : localUsages.length;

  const denominator = dsUsages.length + localLibUsages.length + localInDenominator;
  const adoptionRate = denominator > 0
    ? (dsUsages.length / denominator) * 100
    : 0;

  // Transitive analysis — only local-library usages with transitiveDS count toward effective adoption
  const transitiveLocalLib = localLibUsages.filter(u => u.transitiveDS);

  // Effective adoption: (DS + transitiveLocalLib) / denominator  (same denominator as direct,
  // since transitiveLocalLib ⊂ L which is already included in denominator)
  const effectiveDenominator = denominator;
  const effectiveAdoptionRate = effectiveDenominator > 0
    ? ((dsUsages.length + transitiveLocalLib.length) / effectiveDenominator) * 100
    : 0;

  // Transitive breakdown by DS
  const transitiveByDS = buildTransitiveByDS(transitiveLocalLib, config);

  // Per-DS metrics
  const designSystems = calculatePerDSMetrics(
    dsUsages, transitiveLocalLib, usages, config, denominator, effectiveDenominator, catalog
  );

  // Total DS category metrics
  const designSystemTotal = buildCategoryMetrics(dsUsages);
  const localLibrary = buildCategoryMetrics(localLibUsages);
  const localReusable = buildCategoryMetrics(localReusableUsages);
  const localUnique = buildCategoryMetrics(localUniqueUsages);
  const thirdParty = buildCategoryMetrics(thirdPartyUsages);
  const htmlNative = buildCategoryMetrics(htmlNativeUsages);

  // Denominator-scoped total: counts only categories that participate in direct adoption.
  // Excluded categories (third-party, html-native, and optionally local subsets) are not included.
  const totalComponentInstances = denominator;

  return {
    adoptionRate,
    effectiveAdoptionRate,
    transitiveDS: {
      totalInstances: transitiveLocalLib.length,
      weightedInstances: transitiveLocalLib.length,
      byDS: transitiveByDS,
    },
    designSystems,
    designSystemTotal,
    localLibrary,
    localReusable,
    localUnique,
    thirdParty,
    htmlNative,
    totalComponentInstances,
    filesScanned,
  };
}

function buildTransitiveByDS(
  transitiveUsages: CategorizedUsage[],
  config: ResolvedConfig
): { name: string; instances: number; weightedInstances: number }[] {
  const map = new Map<string, { instances: number; weightedInstances: number }>();

  for (const ds of config.designSystems) {
    map.set(ds.name, { instances: 0, weightedInstances: 0 });
  }

  for (const usage of transitiveUsages) {
    const dsName = usage.transitiveDS!.dsName;
    const entry = map.get(dsName);
    if (entry) {
      entry.instances++;
      entry.weightedInstances += 1;
    }
  }

  return Array.from(map.entries()).map(([name, data]) => ({ name, ...data }));
}

function groupByCategory(
  usages: CategorizedUsage[]
): Map<string, CategorizedUsage[]> {
  const map = new Map<string, CategorizedUsage[]>();
  for (const usage of usages) {
    const list = map.get(usage.category) ?? [];
    list.push(usage);
    map.set(usage.category, list);
  }
  return map;
}

function calculatePerDSMetrics(
  dsUsages: CategorizedUsage[],
  allTransitiveUsages: CategorizedUsage[],
  allUsages: CategorizedUsage[],
  config: ResolvedConfig,
  denominator: number,
  effectiveDenominator: number,
  catalog?: DSCatalog
): DesignSystemMetrics[] {
  return config.designSystems.map(ds => {
    const thisDS = dsUsages.filter(u => u.dsName === ds.name);
    const adoptionRate = denominator > 0 ? (thisDS.length / denominator) * 100 : 0;

    // Transitive local-library usages attributed to this DS
    const thisTransitive = allTransitiveUsages.filter(u => u.transitiveDS?.dsName === ds.name);
    const transitiveInstances = thisTransitive.length;

    const effectiveAdoptionRate = effectiveDenominator > 0
      ? ((thisDS.length + transitiveInstances) / effectiveDenominator) * 100
      : 0;

    const metrics = buildCategoryMetrics(thisDS);

    // Family coverage (only when DS was pre-scanned with path/git)
    let totalFamilies: number | undefined;
    let familiesUsed: number | undefined;
    let familyCoverage: number | undefined;
    let topFamilies: FamilyStat[] | undefined;

    const dsFamilies = catalog?.get(ds.name);
    if (dsFamilies) {
      totalFamilies = dsFamilies.length;

      // Usages from DS-backed local-library components that have a resolved family
      const transitiveWithFamily = allUsages.filter(
        u => u.transitiveDS?.dsName === ds.name && u.componentFamily
      );

      // Unified family coverage: direct design-system usages + DS-backed local-library usages
      const usedFamilyNames = new Set([
        ...thisDS.filter(u => u.componentFamily).map(u => u.componentFamily!),
        ...transitiveWithFamily.map(u => u.componentFamily!),
      ]);
      familiesUsed = usedFamilyNames.size;
      familyCoverage = totalFamilies > 0
        ? (familiesUsed / totalFamilies) * 100
        : 0;

      topFamilies = buildTopFamilies(thisDS, transitiveWithFamily);
    }

    return {
      name: ds.name,
      packages: ds.packages,
      adoptionRate,
      effectiveAdoptionRate,
      instances: thisDS.length,
      transitiveInstances,
      uniqueComponents: metrics.uniqueComponents,
      topComponents: metrics.topComponents,
      ...(totalFamilies !== undefined && {
        totalFamilies,
        familiesUsed,
        familyCoverage,
        topFamilies,
      }),
    };
  });
}

function buildTopFamilies(
  dsUsages: CategorizedUsage[],
  transitiveUsages: CategorizedUsage[]
): FamilyStat[] {
  const familyData = new Map<string, {
    usedComponents: Set<string>;
    instances: number;
    files: Set<string>;
  }>();

  for (const usage of [...dsUsages, ...transitiveUsages]) {
    if (!usage.componentFamily) continue;
    const fName = usage.componentFamily;
    if (!familyData.has(fName)) {
      familyData.set(fName, { usedComponents: new Set(), instances: 0, files: new Set() });
    }
    const entry = familyData.get(fName)!;
    entry.instances++;
    entry.files.add(usage.filePath);
    // Track which sub-components were actually used
    const lookupKey = usage.importEntry?.importedName ?? usage.componentName;
    entry.usedComponents.add(lookupKey);
  }

  return Array.from(familyData.entries())
    .map(([family, data]) => ({
      family,
      components: Array.from(data.usedComponents).sort(),
      instances: data.instances,
      filesUsedIn: data.files.size,
      reposUsedIn: 1, // single-scope here; aggregator may compute cross-repo
    }))
    .sort((a, b) => b.instances - a.instances || a.family.localeCompare(b.family))
    .slice(0, 20);
}

function splitLocalUsages(localUsages: CategorizedUsage[], reusableThreshold: number): {
  reusable: CategorizedUsage[];
  unique: CategorizedUsage[];
} {
  // Group by resolvedPath to determine filesUsedIn per component
  const pathToFiles = new Map<string, Set<string>>();
  for (const u of localUsages) {
    if (!u.resolvedPath) continue;
    if (!pathToFiles.has(u.resolvedPath)) {
      pathToFiles.set(u.resolvedPath, new Set());
    }
    pathToFiles.get(u.resolvedPath)!.add(u.filePath);
  }

  const reusablePaths = new Set<string>();
  for (const [rp, files] of pathToFiles) {
    if (files.size >= reusableThreshold) reusablePaths.add(rp);
  }

  const reusable = localUsages.filter(u => u.resolvedPath && reusablePaths.has(u.resolvedPath));
  const unique   = localUsages.filter(u => !u.resolvedPath || !reusablePaths.has(u.resolvedPath));
  return { reusable, unique };
}

export function buildCategoryMetrics(usages: CategorizedUsage[]): CategoryMetrics {
  // Group by component name to build stats
  const componentMap = new Map<string, {
    usages: CategorizedUsage[];
    files: Set<string>;
    props: Map<string, number>;
  }>();

  for (const usage of usages) {
    const key = usage.componentName;
    if (!componentMap.has(key)) {
      componentMap.set(key, { usages: [], files: new Set(), props: new Map() });
    }
    const entry = componentMap.get(key)!;
    entry.usages.push(usage);
    entry.files.add(usage.filePath);
    for (const prop of usage.props) {
      entry.props.set(prop, (entry.props.get(prop) ?? 0) + 1);
    }
  }

  const components: ComponentStat[] = Array.from(componentMap.entries())
    .map(([name, data]) => {
      const sample = data.usages[0]!;
      const topProps = Array.from(data.props.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([propName, count]) => ({ name: propName, count }));

      return {
        name,
        dsName: sample.dsName,
        packageName: sample.packageName,
        resolvedPath: sample.resolvedPath,
        instances: data.usages.length,
        filesUsedIn: data.files.size,
        topProps,
      };
    })
    .sort((a, b) => b.instances - a.instances);

  return {
    instances: usages.length,
    uniqueComponents: componentMap.size,
    topComponents: components.slice(0, 10),
  };
}
