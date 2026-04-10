import fs from 'node:fs';
import path from 'node:path';
import type { ScanReport } from '../types.js';
import type { ScanReportV2 } from '../domain/types.js';

// ── V1 ────────────────────────────────────────────────────────────────────────

interface ManifestEntry {
  date: string;
  adoptionRate: number;
  file: string;
}

interface Manifest {
  scans: ManifestEntry[];
  latestScan: string | null;
}

export function saveHistory(report: ScanReport, historyDir: string): string {
  const scansDir = path.join(historyDir, 'scans');
  fs.mkdirSync(scansDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const fileName = `scans/${timestamp}.json`;
  const filePath = path.join(historyDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');

  const manifestPath = path.join(historyDir, 'manifest.json');
  const manifest = loadManifest(manifestPath);

  manifest.scans.unshift({
    date: report.meta.timestamp,
    adoptionRate: report.summary.adoptionRate,
    file: fileName,
  });

  manifest.scans = manifest.scans.slice(0, 50);
  manifest.latestScan = fileName;

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return filePath;
}

function loadManifest(manifestPath: string): Manifest {
  if (!fs.existsSync(manifestPath)) {
    return { scans: [], latestScan: null };
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest;
  } catch {
    return { scans: [], latestScan: null };
  }
}

export function compareReports(
  baseline: ScanReport,
  current: ScanReport
): ScanReport['comparison'] {
  const adoptionDelta = current.summary.adoptionRate - baseline.summary.adoptionRate;

  const byDesignSystem = current.summary.designSystems.map(ds => {
    const baseDS = baseline.summary.designSystems.find(b => b.name === ds.name);
    return {
      name: ds.name,
      adoptionDelta: ds.adoptionRate - (baseDS?.adoptionRate ?? 0),
    };
  });

  const byRepository = current.byRepository.map(repo => {
    const baseRepo = baseline.byRepository.find(b => b.name === repo.name);
    const delta = repo.adoptionRate - (baseRepo?.adoptionRate ?? 0);
    return {
      name: repo.name,
      adoptionDelta: delta,
      trend: delta > 0.5 ? 'up' as const : delta < -0.5 ? 'down' as const : 'stable' as const,
    };
  });

  const currentComponents = new Set(
    current.byComponent.designSystems.flatMap(ds => ds.components.map(c => c.name))
  );
  const baselineComponents = new Set(
    baseline.byComponent.designSystems.flatMap(ds => ds.components.map(c => c.name))
  );

  const newComponents = [...currentComponents].filter(c => !baselineComponents.has(c));
  const removedComponents = [...baselineComponents].filter(c => !currentComponents.has(c));

  return {
    baselineDate: baseline.meta.timestamp,
    adoptionDelta,
    byDesignSystem,
    byRepository,
    newComponents,
    removedComponents,
  };
}

export function loadReport(filePath: string): ScanReport {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as ScanReport;
}

// ── V2 ────────────────────────────────────────────────────────────────────────

interface ManifestEntryV2 {
  date: string;
  directAdoptionPct: number;
  shadowUsagePct: number;
  file: string;
}

interface ManifestV2 {
  scans: ManifestEntryV2[];
  latestScan: string | null;
}

export function saveHistoryV2(report: ScanReportV2, historyDir: string): string {
  const scansDir = path.join(historyDir, 'scans-v2');
  fs.mkdirSync(scansDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const fileName = `scans-v2/${timestamp}.json`;
  const filePath = path.join(historyDir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');

  const manifestPath = path.join(historyDir, 'manifest-v2.json');
  const manifest = loadManifestV2(manifestPath);

  manifest.scans.unshift({
    date: report.meta.timestamp,
    directAdoptionPct: report.summary.directAdoption.percentage,
    shadowUsagePct: report.summary.shadowUsageProxy.percentage,
    file: fileName,
  });

  manifest.scans = manifest.scans.slice(0, 50);
  manifest.latestScan = fileName;

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return filePath;
}

function loadManifestV2(manifestPath: string): ManifestV2 {
  if (!fs.existsSync(manifestPath)) {
    return { scans: [], latestScan: null };
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ManifestV2;
  } catch {
    return { scans: [], latestScan: null };
  }
}

export interface V2ReportComparison {
  baselineDate: string;
  directAdoptionDelta: number;
  effectiveAdoptionDelta: number;
  shadowUsageDelta: number;
  byRepository: {
    name: string;
    directAdoptionDelta: number;
    shadowUsageDelta: number;
    trend: 'up' | 'down' | 'stable';
  }[];
  byDesignSystem: {
    name: string;
    directAdoptionDelta: number;
  }[];
  newAdoptionComponents: string[];
  newShadowComponents: string[];
}

export function compareReportsV2(
  baseline: ScanReportV2,
  current: ScanReportV2
): V2ReportComparison {
  const directAdoptionDelta =
    current.summary.directAdoption.percentage - baseline.summary.directAdoption.percentage;
  const effectiveAdoptionDelta =
    current.summary.effectiveAdoptionProxy.percentage -
    baseline.summary.effectiveAdoptionProxy.percentage;
  const shadowUsageDelta =
    current.summary.shadowUsageProxy.percentage - baseline.summary.shadowUsageProxy.percentage;

  const byRepository = current.byRepository.map(repo => {
    const baseRepo = baseline.byRepository.find(b => b.name === repo.name);
    const directDelta =
      repo.directAdoption.percentage - (baseRepo?.directAdoption.percentage ?? 0);
    const shadowDelta =
      repo.shadowUsageProxy.percentage - (baseRepo?.shadowUsageProxy.percentage ?? 0);
    return {
      name: repo.name,
      directAdoptionDelta: directDelta,
      shadowUsageDelta: shadowDelta,
      trend:
        directDelta > 0.5
          ? ('up' as const)
          : directDelta < -0.5
            ? ('down' as const)
            : ('stable' as const),
    };
  });

  const byDesignSystem = current.byDesignSystem.map(ds => {
    const baseDS = baseline.byDesignSystem.find(b => b.name === ds.name);
    return {
      name: ds.name,
      directAdoptionDelta:
        ds.directAdoption.percentage - (baseDS?.directAdoption.percentage ?? 0),
    };
  });

  // New adoption components (in current but not in baseline)
  const currentAdoption = new Set(current.byComponent.adoption.map(c => c.componentName));
  const baselineAdoption = new Set(baseline.byComponent.adoption.map(c => c.componentName));
  const newAdoptionComponents = [...currentAdoption].filter(c => !baselineAdoption.has(c));

  // New shadow candidates (in current but not in baseline)
  const currentShadow = new Set(current.byComponent.shadow.map(p => p.componentName));
  const baselineShadow = new Set(baseline.byComponent.shadow.map(p => p.componentName));
  const newShadowComponents = [...currentShadow].filter(c => !baselineShadow.has(c));

  return {
    baselineDate: baseline.meta.timestamp,
    directAdoptionDelta,
    effectiveAdoptionDelta,
    shadowUsageDelta,
    byRepository,
    byDesignSystem,
    newAdoptionComponents,
    newShadowComponents,
  };
}

export function loadReportV2(filePath: string): ScanReportV2 {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as ScanReportV2;
}
