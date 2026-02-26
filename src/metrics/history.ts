import fs from 'node:fs';
import path from 'node:path';
import type { ScanReport } from '../types.js';

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

  // Update manifest
  const manifestPath = path.join(historyDir, 'manifest.json');
  const manifest = loadManifest(manifestPath);

  manifest.scans.unshift({
    date: report.meta.timestamp,
    adoptionRate: report.summary.adoptionRate,
    file: fileName,
  });

  // Keep last 50 entries
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

  // Find new/removed DS components
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
