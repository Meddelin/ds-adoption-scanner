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

  // Denominator: DS + local-library + local
  const denominator = dsUsages.length + localLibUsages.length + localUsages.length;
  const adoptionRate = denominator > 0
    ? (dsUsages.length / denominator) * 100
    : 0;

  // Per-DS metrics
  const designSystems = calculatePerDSMetrics(dsUsages, usages, config, denominator);

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
  allUsages: CategorizedUsage[],
  config: ResolvedConfig,
  denominator: number
): DesignSystemMetrics[] {
  return config.designSystems.map(ds => {
    const thisDS = dsUsages.filter(u => u.dsName === ds.name);
    const adoptionRate = denominator > 0 ? (thisDS.length / denominator) * 100 : 0;

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
      instances: thisDS.length,
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
