import fs from 'node:fs';
import path from 'node:path';
import type { ScanReport } from '../types.js';

export function formatCSV(report: ScanReport): string {
  const lines: string[] = [];

  // Summary header
  lines.push('# DS Adoption Scanner Report');
  lines.push(`# Generated: ${report.meta.timestamp}`);
  lines.push(`# Total Adoption: ${report.summary.adoptionRate.toFixed(2)}%`);
  lines.push('');

  // Repository breakdown
  lines.push('Repository,Adoption Rate,Files Scanned,' +
    report.meta.designSystemsConfigured.map(ds => `${ds} Adoption`).join(',') +
    ',Local Library Instances,Local Instances,Third Party Instances');

  for (const repo of report.byRepository) {
    const dsCols = report.meta.designSystemsConfigured.map(dsName => {
      const ds = repo.designSystems.find(d => d.name === dsName);
      return ds ? ds.adoptionRate.toFixed(2) : '0.00';
    });

    lines.push([
      csvEscape(repo.name),
      repo.adoptionRate.toFixed(2),
      String(repo.filesScanned),
      ...dsCols,
      String(repo.localLibrary.instances),
      String(repo.local.instances),
      String(repo.thirdParty.instances),
    ].join(','));
  }

  lines.push('');

  // Component breakdown
  lines.push('Component,Category,DS Name,Package,Instances,Files Used In');

  for (const ds of report.byComponent.designSystems) {
    for (const comp of ds.components) {
      lines.push([
        csvEscape(comp.name),
        'design-system',
        csvEscape(ds.name),
        csvEscape(comp.packageName ?? ''),
        String(comp.instances),
        String(comp.filesUsedIn),
      ].join(','));
    }
  }

  for (const comp of report.byComponent.localMostUsed) {
    lines.push([
      csvEscape(comp.name),
      'local',
      '',
      '',
      String(comp.instances),
      String(comp.filesUsedIn),
    ].join(','));
  }

  for (const comp of report.byComponent.thirdParty) {
    lines.push([
      csvEscape(comp.name),
      'third-party',
      '',
      csvEscape(comp.packageName ?? ''),
      String(comp.instances),
      String(comp.filesUsedIn),
    ].join(','));
  }

  return lines.join('\n');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function writeCSV(report: ScanReport, outputPath: string): void {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, formatCSV(report), 'utf-8');
}
