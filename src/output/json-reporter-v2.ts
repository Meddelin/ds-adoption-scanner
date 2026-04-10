// src/output/json-reporter-v2.ts
// V2 JSON reporter for deterministic analytical model

import fs from 'node:fs';
import path from 'node:path';
import type { ScanReportV2 } from '../domain/types.js';

export function formatJSONV2(report: ScanReportV2): string {
  return JSON.stringify(report, null, 2);
}

export function writeJSONV2(report: ScanReportV2, outputPath: string): void {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, formatJSONV2(report), 'utf-8');
}
