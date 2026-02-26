import fs from 'node:fs';
import path from 'node:path';
import type { ScanReport } from '../types.js';

export function formatJSON(report: ScanReport): string {
  return JSON.stringify(report, null, 2);
}

export function writeJSON(report: ScanReport, outputPath: string): void {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, formatJSON(report), 'utf-8');
}
