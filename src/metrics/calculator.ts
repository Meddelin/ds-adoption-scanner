import type {
  CategorizedUsage,
  CategoryMetrics,
  ComponentStat,
  DesignSystemMetrics,
  ScanMetrics,
} from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';

export function calculateMetrics(
  usages: CategorizedUsage[],
  config: ResolvedConfig,
  filesScanned: number
): ScanMetrics {
  // Group usages by category
  const byCategory = groupByCategory(usages);

  const dsUsages = byCategory.get('design-system') ?? [];
  const localLibUsages = byCategory.get('local-library') ?? [];
  const localUsages = byCategory.get('local') ?? [];
  const thirdPartyUsages = byCategory.get('third-party') ?? [];
  const htmlNativeUsages = byCategory.get('html-native') ?? [];

  // Direct adoption: DS / (DS + local-lib + local)
  // When excludeLocalFromAdoption: local is excluded from denominator
  const denominator = dsUsages.length + localLibUsages.length +
    (config.excludeLocalFromAdoption ? 0 : localUsages.length);
  const adoptionRate = denominator > 0
    ? (dsUsages.length / denominator) * 100
    : 0;

  // Transitive analysis
  const transitiveLocalLib = localLibUsages.filter(u => u.transitiveDS);
  const transitiveThirdParty = thirdPartyUsages.filter(u => u.transitiveDS);
  const allTransitive = [...transitiveLocalLib, ...transitiveThirdParty];

  const transitiveWeightedTotal = allTransitive.reduce(
    (sum, u) => sum + (u.transitiveDS!.coverage),
    0
  );

  // Effective adoption: (DS + transitive_weighted) / effective_denominator
  // third-party with transitiveDS is added to denominator (was previously excluded)
  const effectiveDenominator = denominator + transitiveThirdParty.length;
  const effectiveAdoptionRate = effectiveDenominator > 0
    ? ((dsUsages.length + transitiveWeightedTotal) / effectiveDenominator) * 100
    : 0;

  // Transitive breakdown by DS
  const transitiveByDS = buildTransitiveByDS(allTransitive, config);

  // Per-DS metrics
  const designSystems = calculatePerDSMetrics(
    dsUsages, allTransitive, usages, config, denominator, effectiveDenominator
  );

  // Total DS category metrics
  const designSystemTotal = buildCategoryMetrics(dsUsages);
  const localLibrary = buildCategoryMetrics(localLibUsages);
  const local = buildCategoryMetrics(localUsages);
  const thirdParty = buildCategoryMetrics(thirdPartyUsages);
  const htmlNative = buildCategoryMetrics(htmlNativeUsages);

  // File penetration: % of files with at least one DS import
  const filesWithDS = new Set(dsUsages.map(u => u.filePath)).size;
  const filePenetration = filesScanned > 0 ? (filesWithDS / filesScanned) * 100 : 0;

  const totalComponentInstances = usages.filter(u => u.category !== 'html-native').length;

  return {
    adoptionRate,
    effectiveAdoptionRate,
    transitiveDS: {
      totalInstances: allTransitive.length,
      weightedInstances: transitiveWeightedTotal,
      byDS: transitiveByDS,
    },
    designSystems,
    designSystemTotal,
    localLibrary,
    local,
    thirdParty,
    htmlNative,
    filePenetration,
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
      entry.weightedInstances += usage.transitiveDS!.coverage;
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
  effectiveDenominator: number
): DesignSystemMetrics[] {
  return config.designSystems.map(ds => {
    const thisDS = dsUsages.filter(u => u.dsName === ds.name);
    const adoptionRate = denominator > 0 ? (thisDS.length / denominator) * 100 : 0;

    // Transitive usages attributed to this DS
    const thisTransitive = allTransitiveUsages.filter(u => u.transitiveDS?.dsName === ds.name);
    const transitiveInstances = thisTransitive.length;
    const transitiveWeighted = thisTransitive.reduce((s, u) => s + u.transitiveDS!.coverage, 0);

    const effectiveAdoptionRate = effectiveDenominator > 0
      ? ((thisDS.length + transitiveWeighted) / effectiveDenominator) * 100
      : 0;

    // File penetration for this DS
    const filesWithThisDS = new Set(thisDS.map(u => u.filePath));
    const totalFiles = new Set(allUsages.map(u => u.filePath)).size;
    const filePenetration = totalFiles > 0
      ? (filesWithThisDS.size / totalFiles) * 100
      : 0;

    const metrics = buildCategoryMetrics(thisDS);

    return {
      name: ds.name,
      packages: ds.packages,
      adoptionRate,
      effectiveAdoptionRate,
      instances: thisDS.length,
      transitiveInstances,
      transitiveWeighted,
      uniqueComponents: metrics.uniqueComponents,
      topComponents: metrics.topComponents,
      filePenetration,
    };
  });
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
