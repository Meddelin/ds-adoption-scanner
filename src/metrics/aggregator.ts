import type {
  CategorizedUsage,
  CategoryMetrics,
  ComponentStat,
  RepositoryReport,
  ScanReport,
} from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { calculateMetrics, buildCategoryMetrics } from './calculator.js';

export interface RepoScanData {
  repositoryName: string;
  repositoryPath: string;
  usages: CategorizedUsage[];
  filesScanned: number;
}

export function aggregateResults(
  repoData: RepoScanData[],
  config: ResolvedConfig,
  meta: {
    version: string;
    configPath: string;
    scanDurationMs: number;
  }
): ScanReport {
  const allUsages = repoData.flatMap(r => r.usages);
  const totalFilesScanned = repoData.reduce((sum, r) => sum + r.filesScanned, 0);

  // Global metrics
  const globalMetrics = calculateMetrics(allUsages, config, totalFilesScanned);

  // Per-repository reports
  const byRepository: RepositoryReport[] = repoData.map(repo =>
    buildRepositoryReport(repo, config)
  );

  // Component-level aggregation
  const byComponent = buildByComponent(allUsages, config);

  return {
    meta: {
      version: meta.version,
      timestamp: new Date().toISOString(),
      scanDurationMs: meta.scanDurationMs,
      configPath: meta.configPath,
      filesScanned: totalFilesScanned,
      repositoriesScanned: repoData.length,
      designSystemsConfigured: config.designSystems.map(ds => ds.name),
    },
    summary: {
      adoptionRate: globalMetrics.adoptionRate,
      effectiveAdoptionRate: globalMetrics.effectiveAdoptionRate,
      transitiveDS: globalMetrics.transitiveDS,
      totalComponentInstances: globalMetrics.totalComponentInstances,
      filePenetration: globalMetrics.filePenetration,
      designSystems: globalMetrics.designSystems.map(ds => ({
        name: ds.name,
        adoptionRate: ds.adoptionRate,
        effectiveAdoptionRate: ds.effectiveAdoptionRate,
        instances: ds.instances,
        transitiveInstances: ds.transitiveInstances,
        uniqueComponents: ds.uniqueComponents,
        filePenetration: ds.filePenetration,
      })),
      designSystemTotal: globalMetrics.designSystemTotal,
      localLibrary: globalMetrics.localLibrary,
      local: globalMetrics.local,
      thirdParty: globalMetrics.thirdParty,
      htmlNative: globalMetrics.htmlNative,
    },
    byRepository,
    byComponent,
  };
}

function buildRepositoryReport(
  repo: RepoScanData,
  config: ResolvedConfig
): RepositoryReport {
  const metrics = calculateMetrics(repo.usages, config, repo.filesScanned);

  return {
    name: repo.repositoryName,
    path: repo.repositoryPath,
    adoptionRate: metrics.adoptionRate,
    effectiveAdoptionRate: metrics.effectiveAdoptionRate,
    filesScanned: repo.filesScanned,
    designSystems: metrics.designSystems.map(ds => ({
      name: ds.name,
      adoptionRate: ds.adoptionRate,
      effectiveAdoptionRate: ds.effectiveAdoptionRate,
      instances: ds.instances,
      transitiveInstances: ds.transitiveInstances,
      uniqueComponents: ds.uniqueComponents,
    })),
    designSystemTotal: metrics.designSystemTotal,
    localLibrary: metrics.localLibrary,
    local: metrics.local,
    thirdParty: metrics.thirdParty,
    htmlNative: metrics.htmlNative,
  };
}

function buildByComponent(
  allUsages: CategorizedUsage[],
  config: ResolvedConfig
): ScanReport['byComponent'] {
  const dsUsages = allUsages.filter(u => u.category === 'design-system');
  const localUsages = allUsages.filter(u => u.category === 'local' || u.category === 'local-library');
  const thirdPartyUsages = allUsages.filter(u => u.category === 'third-party');

  // DS components grouped by DS name
  const designSystems = config.designSystems.map(ds => {
    const thisDS = dsUsages.filter(u => u.dsName === ds.name);
    return {
      name: ds.name,
      components: buildComponentStats(thisDS).slice(0, 50),
    };
  });

  // Top local/local-library components (include resolvedPath for AI agents)
  const localMostUsed = buildComponentStats(localUsages).slice(0, 30);

  // Third-party components
  const thirdParty = buildComponentStats(thirdPartyUsages).slice(0, 20);

  return { designSystems, localMostUsed, thirdParty };
}

function buildComponentStats(usages: CategorizedUsage[]): ComponentStat[] {
  const map = new Map<string, {
    usages: CategorizedUsage[];
    files: Set<string>;
    props: Map<string, number>;
  }>();

  for (const usage of usages) {
    const key = usage.componentName;
    if (!map.has(key)) {
      map.set(key, { usages: [], files: new Set(), props: new Map() });
    }
    const entry = map.get(key)!;
    entry.usages.push(usage);
    entry.files.add(usage.filePath);
    for (const prop of usage.props) {
      entry.props.set(prop, (entry.props.get(prop) ?? 0) + 1);
    }
  }

  return Array.from(map.entries())
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
}
