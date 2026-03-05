import path from 'node:path';
import type {
  CategorizedUsage,
  CategoryMetrics,
  ComponentStat,
  DSCatalog,
  LocalFamilyStat,
  LocalReuseReport,
  RepositoryReport,
  ScanReport,
} from '../types.js';
import type { ResolvedConfig } from '../config/schema.js';
import { calculateMetrics, buildCategoryMetrics } from './calculator.js';
import { GENERIC_DIRS } from '../scanner/ds-prescan.js';

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
    dsCatalog?: DSCatalog;
  }
): ScanReport {
  const allUsages = repoData.flatMap(r => r.usages);
  const totalFilesScanned = repoData.reduce((sum, r) => sum + r.filesScanned, 0);
  const dsCatalog = meta.dsCatalog;

  // Global metrics
  const globalMetrics = calculateMetrics(allUsages, config, totalFilesScanned, dsCatalog);

  // Per-repository reports
  const byRepository: RepositoryReport[] = repoData.map(repo =>
    buildRepositoryReport(repo, config, dsCatalog)
  );

  // Component-level aggregation
  const byComponent = buildByComponent(allUsages, config, globalMetrics.designSystems, repoData);

  // Local reuse analysis
  const localReuseAnalysis = buildLocalReuseAnalysis(repoData);

  return {
    meta: {
      version: meta.version,
      timestamp: new Date().toISOString(),
      scanDurationMs: meta.scanDurationMs,
      configPath: meta.configPath,
      filesScanned: totalFilesScanned,
      repositoriesScanned: repoData.length,
      designSystemsConfigured: config.designSystems.map(ds => ds.name),
      excludeLocalFromAdoption: config.excludeLocalFromAdoption,
      excludeUniqueLocalFromAdoption: config.excludeUniqueLocalFromAdoption,
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
        ...(ds.totalFamilies !== undefined && {
          totalFamilies: ds.totalFamilies,
          familiesUsed: ds.familiesUsed,
          familyCoverage: ds.familyCoverage,
        }),
      })),
      designSystemTotal: globalMetrics.designSystemTotal,
      localLibrary: globalMetrics.localLibrary,
      localReusable: globalMetrics.localReusable,
      localUnique: globalMetrics.localUnique,
      thirdParty: globalMetrics.thirdParty,
      htmlNative: globalMetrics.htmlNative,
    },
    byRepository,
    byComponent,
    localReuseAnalysis,
  };
}

function buildRepositoryReport(
  repo: RepoScanData,
  config: ResolvedConfig,
  dsCatalog?: DSCatalog
): RepositoryReport {
  const metrics = calculateMetrics(repo.usages, config, repo.filesScanned, dsCatalog);

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
      ...(ds.totalFamilies !== undefined && {
        totalFamilies: ds.totalFamilies,
        familiesUsed: ds.familiesUsed,
        familyCoverage: ds.familyCoverage,
      }),
    })),
    designSystemTotal: metrics.designSystemTotal,
    localLibrary: metrics.localLibrary,
    localReusable: metrics.localReusable,
    localUnique: metrics.localUnique,
    thirdParty: metrics.thirdParty,
    htmlNative: metrics.htmlNative,
  };
}

function buildByComponent(
  allUsages: CategorizedUsage[],
  config: ResolvedConfig,
  dsMetrics?: import('../types.js').DesignSystemMetrics[],
  repoData?: RepoScanData[]
): ScanReport['byComponent'] {
  const dsUsages = allUsages.filter(u => u.category === 'design-system');
  const localUsages = allUsages.filter(u => u.category === 'local' || u.category === 'local-library');
  const thirdPartyUsages = allUsages.filter(u => u.category === 'third-party');

  // DS components grouped by DS name
  const designSystems = config.designSystems.map(ds => {
    const thisDS = dsUsages.filter(u => u.dsName === ds.name);
    const dsMetric = dsMetrics?.find(d => d.name === ds.name);
    return {
      name: ds.name,
      components: buildComponentStats(thisDS).slice(0, 50),
      ...(dsMetric?.topFamilies ? { topFamilies: dsMetric.topFamilies } : {}),
    };
  });

  // Top local/local-library components (include resolvedPath for AI agents)
  const localMostUsed = buildComponentStats(localUsages).slice(0, 30);

  // Local component families
  const localTopFamilies = repoData
    ? buildLocalTopFamilies(allUsages, repoData)
    : [];

  // Third-party components
  const thirdParty = buildComponentStats(thirdPartyUsages).slice(0, 20);

  return { designSystems, localMostUsed, localTopFamilies, thirdParty };
}

function getLocalFamilyName(resolvedPath: string, componentName: string): string {
  // Check immediate parent dir and one level above (max 2 levels).
  // Returns first non-GENERIC_DIR segment, or componentName as fallback.
  // Depth limit avoids climbing to repo root / OS path segments.
  let dir = path.dirname(resolvedPath);
  for (let depth = 0; depth < 2; depth++) {
    const seg = path.basename(dir);
    if (!seg || seg === '.' || seg === '..') break;
    if (!GENERIC_DIRS.has(seg.toLowerCase())) return seg;
    dir = path.dirname(dir);
  }
  return componentName;
}

function buildLocalTopFamilies(
  allUsages: CategorizedUsage[],
  repoData: RepoScanData[]
): LocalFamilyStat[] {
  const localOnly = allUsages.filter(u => u.category === 'local' && u.resolvedPath);

  // Build filePath → repoName lookup
  const fileToRepo = new Map<string, string>();
  for (const repo of repoData) {
    for (const u of repo.usages) {
      fileToRepo.set(u.filePath, repo.repositoryName);
    }
  }

  const familyMap = new Map<string, {
    components: Set<string>;
    instances: number;
    files: Set<string>;
    repos: Set<string>;
  }>();

  for (const u of localOnly) {
    const familyName = getLocalFamilyName(u.resolvedPath!, u.componentName);
    if (!familyMap.has(familyName)) {
      familyMap.set(familyName, { components: new Set(), instances: 0, files: new Set(), repos: new Set() });
    }
    const entry = familyMap.get(familyName)!;
    entry.components.add(u.componentName);
    entry.instances++;
    entry.files.add(u.filePath);
    const repo = fileToRepo.get(u.filePath);
    if (repo) entry.repos.add(repo);
  }

  return Array.from(familyMap.entries())
    .map(([family, d]) => ({
      family,
      components: Array.from(d.components).sort(),
      instances: d.instances,
      filesUsedIn: d.files.size,
      reposUsedIn: d.repos.size,
    }))
    .sort((a, b) => b.instances - a.instances || a.family.localeCompare(b.family))
    .slice(0, 20);
}

export function buildLocalReuseAnalysis(repoData: RepoScanData[]): LocalReuseReport {
  const byPath = new Map<string, {
    name: string;
    files: Set<string>;
    repos: Set<string>;
    count: number;
  }>();
  let inlineCount = 0;

  for (const repo of repoData) {
    for (const usage of repo.usages) {
      if (usage.category !== 'local') continue;
      if (!usage.resolvedPath) { inlineCount++; continue; }

      if (!byPath.has(usage.resolvedPath)) {
        byPath.set(usage.resolvedPath, {
          name: usage.componentName,
          files: new Set(),
          repos: new Set(),
          count: 0,
        });
      }
      const entry = byPath.get(usage.resolvedPath)!;
      entry.files.add(usage.filePath);
      entry.repos.add(repo.repositoryName);
      entry.count++;
    }
  }

  const groups = Array.from(byPath.entries()).map(([resolvedPath, d]) => ({
    componentName: d.name,
    resolvedPath,
    instances: d.count,
    filesUsedIn: d.files.size,
    reposUsedIn: d.repos.size,
  }));

  const singletons = groups.filter(g => g.filesUsedIn === 1);
  const localReuse = groups.filter(g => g.filesUsedIn >= 2 && g.reposUsedIn === 1);
  const crossRepo = groups.filter(g => g.reposUsedIn >= 2);

  const topCandidates = [...crossRepo, ...localReuse]
    .sort((a, b) =>
      b.reposUsedIn - a.reposUsedIn ||
      b.filesUsedIn - a.filesUsedIn ||
      b.instances - a.instances
    )
    .slice(0, 20);

  return {
    totalTracked: byPath.size,
    inlineCount,
    singletonCount: singletons.length,
    localReuseCount: localReuse.length,
    crossRepoCount: crossRepo.length,
    topCandidates,
  };
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
