// src/output/html-reporter-v2.ts
// V2 HTML reporter for deterministic analytical model

import fs from 'node:fs';
import path from 'node:path';
import type { ScanReportV2, MetricWithDetails, BucketBreakdown } from '../domain/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(n: number): string {
  return n.toFixed(1) + '%';
}

function adoptionColor(n: number): string {
  if (n >= 70) return 'var(--ok)';
  if (n >= 40) return 'var(--warn)';
  return 'var(--bad)';
}

function shadowColor(n: number): string {
  if (n >= 30) return 'var(--bad)'; // High shadow is bad
  if (n >= 15) return 'var(--warn)';
  return 'var(--ok)';
}

function bar(n: number, color?: string): string {
  const c = color ?? adoptionColor(n);
  return `<span class="bar" style="--w:${Math.min(n, 100).toFixed(1)}%;--c:${c}" title="${pct(n)}"></span>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(n: number): string {
  return n.toLocaleString('en-US');
}

function badge(n: number, type: 'adoption' | 'shadow' = 'adoption'): string {
  const color = type === 'shadow' ? shadowColor(n) : adoptionColor(n);
  return `<span class="badge" style="background:${color}">${pct(n)}</span>`;
}

function proxyLabel(isProxy: boolean): string {
  return isProxy ? '<span class="proxy-tag" title="Proxy metric — see formula for details">proxy</span>' : '<span class="exact-tag">exact</span>';
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
:root {
  --ds:    #4f46e5;
  --lib:   #0891b2;
  --loc:   #6b7280;
  --ok:    #16a34a;
  --warn:  #d97706;
  --bad:   #dc2626;
  --bg:    #f8fafc;
  --card:  #ffffff;
  --border:#e2e8f0;
  --text:  #0f172a;
  --muted: #64748b;
  --head:  #1e293b;
  --shadow:#7c3aed;
  --neither:#94a3b8;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;background:var(--bg);color:var(--text);line-height:1.5}
a{color:var(--ds);text-decoration:none}
.page{max-width:1200px;margin:0 auto;padding:24px 20px}
.header{background:var(--head);color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
.header h1{font-size:20px;font-weight:700;letter-spacing:-.3px}
.header-meta{font-size:12px;opacity:.7;text-align:right}
.cards{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;flex:1 1 200px;min-width:200px}
.card-title{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;display:flex;align-items:center;gap:8px}
.card-value{font-size:32px;font-weight:700;line-height:1}
.card-sub{font-size:12px;color:var(--muted);margin-top:6px}
.hero-ok{color:var(--ok)}.hero-warn{color:var(--warn)}.hero-bad{color:var(--bad)}
.section{margin-bottom:32px}
.section-title{font-size:15px;font-weight:700;color:var(--head);margin-bottom:12px;display:flex;align-items:center;gap:8px}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:10px;overflow:hidden;border:1px solid var(--border);font-size:13px}
thead th{background:var(--head);color:#fff;padding:10px 14px;text-align:left;font-size:12px;font-weight:600;letter-spacing:.04em;white-space:nowrap}
tbody tr:nth-child(even){background:#f1f5f9}
tbody tr:hover{background:#e2e8f0}
td{padding:9px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
td.num{text-align:right;font-variant-numeric:tabular-nums}
td.muted{color:var(--muted)}
.bar{display:inline-block;height:8px;width:var(--w,0%);background:var(--c,#ccc);border-radius:4px;vertical-align:middle;max-width:160px;min-width:2px;transition:width .3s}
.bar-wrap{display:flex;align-items:center;gap:8px;white-space:nowrap}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;color:#fff;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
.proxy-tag{font-size:10px;padding:2px 6px;border-radius:4px;background:var(--warn);color:#fff;text-transform:uppercase;letter-spacing:0.05em}
.exact-tag{font-size:10px;padding:2px 6px;border-radius:4px;background:var(--ok);color:#fff;text-transform:uppercase;letter-spacing:0.05em}
/* Bucket breakdown */
.bucket-grid{display:grid;grid-template-columns:repeat(3, 1fr);gap:16px;margin-bottom:24px}
.bucket-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:16px}
.bucket-card.adoption{border-left:4px solid var(--ds)}
.bucket-card.shadow{border-left:4px solid var(--shadow)}
.bucket-card.neither{border-left:4px solid var(--neither)}
.bucket-name{font-size:13px;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em}
.bucket-card.adoption .bucket-name{color:var(--ds)}
.bucket-card.shadow .bucket-name{color:var(--shadow)}
.bucket-card.neither .bucket-name{color:var(--neither)}
.bucket-value{font-size:24px;font-weight:700;margin-bottom:4px}
.bucket-pct{font-size:12px;color:var(--muted)}
/* Formula box */
.formula-box{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-bottom:24px}
.formula-row{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 10px;margin-bottom:10px;font-size:13px}
.formula-row:last-child{margin-bottom:0}
.formula-label{font-weight:700;color:var(--head);min-width:200px}
.formula-eq{font-family:'Courier New',monospace;color:var(--text);font-weight:600}
.formula-result{font-weight:700;font-size:15px}
/* Route table */
.route-row{cursor:pointer}
.route-row:hover{background:#e2e8f0}
.route-details{padding:16px;background:#f8fafc;border-top:1px solid var(--border)}
/* Footer */
.footer{margin-top:32px;padding-top:16px;border-top:1px solid var(--border);color:var(--muted);font-size:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
`.trim();

// ─── Section Builders ─────────────────────────────────────────────────────────

function buildHeader(report: ScanReportV2): string {
  const date = new Date(report.meta.timestamp).toLocaleString();
  return `
  <div class="header">
    <h1>📊 DS Adoption Report v2</h1>
    <div class="header-meta">
      <div>${esc(date)}</div>
      <div>${report.meta.repositoriesScanned} repo${report.meta.repositoriesScanned !== 1 ? 's' : ''} · ${num(report.meta.filesScanned)} files</div>
    </div>
  </div>`;
}

function buildHeroCards(report: ScanReportV2): string {
  const { summary } = report;
  const { directAdoption, effectiveAdoptionProxy, shadowUsageProxy } = summary;

  const adoptClass = (n: number) => n >= 70 ? 'hero-ok' : n >= 40 ? 'hero-warn' : 'hero-bad';

  return `
  <div class="cards">
    <div class="card">
      <div class="card-title">Direct Adoption ${proxyLabel(directAdoption.isProxy)}</div>
      <div class="card-value ${adoptClass(directAdoption.percentage)}">${pct(directAdoption.percentage)}</div>
      <div class="card-sub">${bar(directAdoption.percentage)} ${num(directAdoption.instances)} instances</div>
    </div>
    <div class="card">
      <div class="card-title">Effective Adoption Proxy ${proxyLabel(effectiveAdoptionProxy.isProxy)}</div>
      <div class="card-value ${adoptClass(effectiveAdoptionProxy.percentage)}">${pct(effectiveAdoptionProxy.percentage)}</div>
      <div class="card-sub">${bar(effectiveAdoptionProxy.percentage)} +${pct(effectiveAdoptionProxy.percentage - directAdoption.percentage)} via transitive</div>
    </div>
    <div class="card">
      <div class="card-title">Shadow Usage Proxy ${proxyLabel(shadowUsageProxy.isProxy)}</div>
      <div class="card-value" style="color:${shadowColor(shadowUsageProxy.percentage)}">${pct(shadowUsageProxy.percentage)}</div>
      <div class="card-sub">${bar(shadowUsageProxy.percentage, shadowColor(shadowUsageProxy.percentage))} ${num(shadowUsageProxy.instances)} instances</div>
    </div>
  </div>`;
}

function buildBucketBreakdown(report: ScanReportV2): string {
  const { bucketBreakdown } = report.summary;

  return `
  <div class="section">
    <div class="section-title">📦 Analytical Bucket Breakdown</div>
    <div class="bucket-grid">
      <div class="bucket-card adoption">
        <div class="bucket-name">Adoption</div>
        <div class="bucket-value">${pct(bucketBreakdown.adoption.percentage)}</div>
        <div class="bucket-pct">${num(bucketBreakdown.adoption.instances)} instances · ${num(bucketBreakdown.adoption.components)} components</div>
      </div>
      <div class="bucket-card shadow">
        <div class="bucket-name">Shadow Usage</div>
        <div class="bucket-value">${pct(bucketBreakdown.shadow.percentage)}</div>
        <div class="bucket-pct">${num(bucketBreakdown.shadow.instances)} instances · ${num(bucketBreakdown.shadow.components)} components</div>
      </div>
      <div class="bucket-card neither">
        <div class="bucket-name">Neither</div>
        <div class="bucket-value">${pct(bucketBreakdown.neither.percentage)}</div>
        <div class="bucket-pct">${num(bucketBreakdown.neither.instances)} instances · ${num(bucketBreakdown.neither.components)} components</div>
      </div>
    </div>
  </div>`;
}

function buildFormulas(report: ScanReportV2): string {
  const { directAdoption, effectiveAdoptionProxy, shadowUsageProxy } = report.summary;

  return `
  <div class="section">
    <div class="section-title">📐 Metric Formulas</div>
    <div class="formula-box">
      <div class="formula-row">
        <span class="formula-label">Direct Adoption</span>
        <span class="formula-eq">${esc(directAdoption.formula)}</span>
      </div>
      <div class="formula-row">
        <span class="formula-label">Effective Adoption Proxy</span>
        <span class="formula-eq">${esc(effectiveAdoptionProxy.formula)}</span>
      </div>
      <div class="formula-row">
        <span class="formula-label">Shadow Usage Proxy</span>
        <span class="formula-eq">${esc(shadowUsageProxy.formula)}</span>
      </div>
      <div class="formula-row" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <span class="formula-label">Denominator</span>
        <span class="formula-eq">${esc(directAdoption.denominator.explanation)}</span>
      </div>
    </div>
  </div>`;
}

function buildDSCards(report: ScanReportV2): string {
  const { byDesignSystem } = report;
  if (byDesignSystem.length === 0) return '';

  const cards = byDesignSystem.map(ds => {
    return `
    <div class="card" style="border-left:4px solid var(--ds)">
      <div class="card-title">${esc(ds.name)}</div>
      <div style="display:flex;gap:16px;margin-bottom:8px">
        <div>
          <div style="font-size:11px;color:var(--muted)">Direct</div>
          <div style="font-size:20px;font-weight:700;color:var(--ds)">${pct(ds.directAdoption.percentage)}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--muted)">Effective Proxy</div>
          <div style="font-size:20px;font-weight:700">${pct(ds.effectiveAdoptionProxy.percentage)}</div>
        </div>
      </div>
      <div class="card-sub">${num(ds.instances)} direct · ${num(ds.transitiveInstances)} transitive · ${num(ds.uniqueComponents)} unique</div>
    </div>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">🎨 Design Systems</div>
    <div class="cards">${cards}</div>
  </div>`;
}

function buildRouteTable(report: ScanReportV2): string {
  if (!report.byRoute || report.byRoute.length === 0) return '';

  const rows = report.byRoute.slice(0, 20).map(route => {
    const confidenceIcon = route.confidence === 'high' ? '✓' : route.confidence === 'medium' ? '~' : '?';
    return `
    <tr class="route-row">
      <td><span title="Confidence: ${route.confidence}">${confidenceIcon}</span> ${esc(route.routeId)}</td>
      <td class="num">${badge(route.directAdoption.percentage)}</td>
      <td class="num">${badge(route.effectiveAdoptionProxy.percentage)}</td>
      <td class="num">${badge(route.shadowUsageProxy.percentage, 'shadow')}</td>
      <td class="num">${num(route.buckets.adoption.instances)}</td>
      <td class="num">${num(route.buckets.shadow.instances)}</td>
    </tr>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">🛣️ Route-Level Metrics (Top 20)</div>
    <table>
      <thead>
        <tr>
          <th>Route</th>
          <th class="num">Direct</th>
          <th class="num">Effective Proxy</th>
          <th class="num">Shadow Proxy</th>
          <th class="num">Adoption Instances</th>
          <th class="num">Shadow Instances</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildShadowComponents(report: ScanReportV2): string {
  const shadowProfiles = report.localComponentProfiles
    .filter(p => p.analyticalBucket === 'shadow')
    .slice(0, 10);

  if (shadowProfiles.length === 0) return '';

  const rows = shadowProfiles.map(p => {
    const signals = p.signals.map(s => `<span title="${esc(s.evidence)}">${s.type}</span>`).join(', ');
    return `
    <tr>
      <td>${esc(p.componentName)}</td>
      <td class="muted">${esc(p.resolvedPath.split('/').pop() || '')}</td>
      <td class="num">${p.fileCount}</td>
      <td class="num">${p.routeCount}</td>
      <td class="muted">${signals}</td>
    </tr>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">👥 Top Shadow Usage Candidates</div>
    <table>
      <thead>
        <tr>
          <th>Component</th>
          <th>File</th>
          <th class="num">Files Used</th>
          <th class="num">Routes</th>
          <th>Signals</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildFooter(report: ScanReportV2): string {
  const warnings = report.summary.routeCoverage.warnings;
  const warningText = warnings.length > 0 ? `<div style="color:var(--warn)">⚠️ ${esc(warnings.join('; '))}</div>` : '';

  return `
  <div class="footer">
    <div>
      <div>DS Adoption Scanner v${esc(report.meta.scannerVersion)}</div>
      ${warningText}
    </div>
    <div style="text-align:right">
      <div>Scanned in ${(report.meta.scanDurationMs / 1000).toFixed(1)}s</div>
      <div>Route resolution: ${report.meta.routeResolutionEnabled ? 'enabled' : 'disabled'}</div>
    </div>
  </div>`;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function buildHTMLV2(report: ScanReportV2): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DS Adoption Report v2</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="page">
    ${buildHeader(report)}
    ${buildHeroCards(report)}
    ${buildBucketBreakdown(report)}
    ${buildFormulas(report)}
    ${buildDSCards(report)}
    ${buildRouteTable(report)}
    ${buildShadowComponents(report)}
    ${buildFooter(report)}
  </div>
</body>
</html>`;
}

export function writeHTMLV2(report: ScanReportV2, outputPath: string): void {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, buildHTMLV2(report), 'utf-8');
}
