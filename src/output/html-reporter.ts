import fs from 'node:fs';
import path from 'node:path';
import type { ScanReport } from '../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(n: number): string {
  return n.toFixed(1) + '%';
}

function adoptionColor(n: number): string {
  if (n >= 70) return 'var(--ok)';
  if (n >= 40) return 'var(--warn)';
  return 'var(--bad)';
}

function bar(n: number, label?: string): string {
  const title = label ?? pct(n);
  return `<span class="bar" style="--w:${Math.min(n, 100).toFixed(1)}%;--c:${adoptionColor(n)}" title="${title}"></span>`;
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

function adoptionBadge(n: number): string {
  return `<span class="badge" style="background:${adoptionColor(n)}">${pct(n)}</span>`;
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
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;background:var(--bg);color:var(--text);line-height:1.5}
a{color:var(--ds);text-decoration:none}
/* Layout */
.page{max-width:1200px;margin:0 auto;padding:24px 20px}
/* Header */
.header{background:var(--head);color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
.header h1{font-size:20px;font-weight:700;letter-spacing:-.3px}
.header-meta{font-size:12px;opacity:.7;text-align:right}
/* Cards row */
.cards{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;flex:1 1 180px;min-width:180px}
.card-title{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
.card-value{font-size:32px;font-weight:700;line-height:1}
.card-sub{font-size:12px;color:var(--muted);margin-top:6px}
/* Hero adoption cards */
.hero-ok{color:var(--ok)}.hero-warn{color:var(--warn)}.hero-bad{color:var(--bad)}
/* Section */
.section{margin-bottom:32px}
.section-title{font-size:15px;font-weight:700;color:var(--head);margin-bottom:12px;display:flex;align-items:center;gap:8px}
/* Tables */
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:10px;overflow:hidden;border:1px solid var(--border);font-size:13px}
thead th{background:var(--head);color:#fff;padding:10px 14px;text-align:left;font-size:12px;font-weight:600;letter-spacing:.04em;white-space:nowrap}
tbody tr:nth-child(even){background:#f1f5f9}
tbody tr:hover{background:#e2e8f0}
td{padding:9px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
td.num{text-align:right;font-variant-numeric:tabular-nums}
td.muted{color:var(--muted)}
/* Progress bar */
.bar{display:inline-block;height:8px;width:var(--w,0%);background:var(--c,#ccc);border-radius:4px;vertical-align:middle;max-width:160px;min-width:2px;transition:width .3s}
.bar-wrap{display:flex;align-items:center;gap:8px;white-space:nowrap}
/* Badge */
.badge{display:inline-block;padding:2px 8px;border-radius:12px;color:#fff;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
/* DS cards */
.ds-cards{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px}
.ds-card{background:var(--card);border:1px solid var(--border);border-left:4px solid var(--ds);border-radius:8px;padding:16px;flex:1 1 200px;min-width:200px}
.ds-card-name{font-size:13px;font-weight:700;color:var(--ds);margin-bottom:10px}
.ds-card-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px}
.ds-card-label{color:var(--muted)}
/* Stacked bar for category breakdown */
.stacked-wrap{height:24px;display:flex;border-radius:6px;overflow:hidden;margin-bottom:12px;border:1px solid var(--border)}
.stacked-seg{height:100%;transition:width .3s;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:600;overflow:hidden;white-space:nowrap}
/* Details/summary for repo rows */
details>summary{cursor:pointer;list-style:none}
details>summary::-webkit-details-marker{display:none}
/* Footer */
.footer{margin-top:32px;padding-top:16px;border-top:1px solid var(--border);color:var(--muted);font-size:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
`.trim();

// ─── Section builders ─────────────────────────────────────────────────────────

function buildHeader(report: ScanReport): string {
  const date = new Date(report.meta.timestamp).toLocaleString();
  const configBase = path.basename(report.meta.configPath);
  return `
  <div class="header">
    <h1>📊 DS Adoption Report</h1>
    <div class="header-meta">
      <div>${esc(date)}</div>
      <div>${esc(configBase)} · ${report.meta.repositoriesScanned} repo${report.meta.repositoriesScanned !== 1 ? 's' : ''}</div>
    </div>
  </div>`;
}

function buildHeroCards(report: ScanReport): string {
  const { summary } = report;
  const hasTransitive = summary.effectiveAdoptionRate > summary.adoptionRate + 0.05;
  const adoptClass = (n: number) => n >= 70 ? 'hero-ok' : n >= 40 ? 'hero-warn' : 'hero-bad';

  const directCard = `
    <div class="card">
      <div class="card-title">${hasTransitive ? 'Direct DS Adoption' : 'Total DS Adoption'}</div>
      <div class="card-value ${adoptClass(summary.adoptionRate)}">${pct(summary.adoptionRate)}</div>
      <div class="card-sub">${bar(summary.adoptionRate)}</div>
    </div>`;

  const effectiveCard = hasTransitive ? `
    <div class="card">
      <div class="card-title">Effective Adoption</div>
      <div class="card-value ${adoptClass(summary.effectiveAdoptionRate)}">${pct(summary.effectiveAdoptionRate)}</div>
      <div class="card-sub">${bar(summary.effectiveAdoptionRate)} <span style="color:var(--muted);font-size:11px">+${pct(summary.effectiveAdoptionRate - summary.adoptionRate)} transitive</span></div>
    </div>` : '';

  const filePenCard = `
    <div class="card">
      <div class="card-title">File Penetration</div>
      <div class="card-value ${adoptClass(summary.filePenetration)}">${pct(summary.filePenetration)}</div>
      <div class="card-sub">${bar(summary.filePenetration)}</div>
    </div>`;

  const totalCard = `
    <div class="card">
      <div class="card-title">Total Instances</div>
      <div class="card-value">${num(summary.totalComponentInstances)}</div>
      <div class="card-sub" style="color:var(--muted)">DS: ${num(summary.designSystemTotal.instances)}</div>
    </div>`;

  return `<div class="cards">${directCard}${effectiveCard}${filePenCard}${totalCard}</div>`;
}

function buildDSCards(report: ScanReport): string {
  const { summary } = report;
  if (summary.designSystems.length === 0) return '';

  const showEffective = summary.designSystems.some(
    ds => ds.effectiveAdoptionRate > ds.adoptionRate + 0.05
  );

  const cards = summary.designSystems.map(ds => {
    const familiesRow = ds.totalFamilies !== undefined ? `
      <div class="ds-card-row">
        <span class="ds-card-label">Families</span>
        <span>${ds.familiesUsed}/${ds.totalFamilies} (${pct(ds.familyCoverage ?? 0)})</span>
      </div>
      <div style="margin-bottom:6px">${bar(ds.familyCoverage ?? 0)}</div>` : '';

    const effectiveRow = showEffective ? `
      <div class="ds-card-row">
        <span class="ds-card-label">Effective</span>
        ${adoptionBadge(ds.effectiveAdoptionRate)}
      </div>` : '';

    return `
    <div class="ds-card">
      <div class="ds-card-name">${esc(ds.name)}</div>
      <div class="ds-card-row">
        <span class="ds-card-label">Adoption</span>
        ${adoptionBadge(ds.adoptionRate)}
      </div>
      ${effectiveRow}
      ${familiesRow}
      <div class="ds-card-row">
        <span class="ds-card-label">Instances</span>
        <span>${num(ds.instances)}${ds.transitiveInstances > 0 ? ` <span style="color:var(--muted);font-size:11px">+${ds.transitiveInstances}</span>` : ''}</span>
      </div>
      <div class="ds-card-row">
        <span class="ds-card-label">Files w/ DS</span>
        <span>${pct(ds.filePenetration)}</span>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">📐 Per Design System</div>
    <div class="ds-cards">${cards}</div>
  </div>`;
}

function buildDSCatalog(report: ScanReport): string {
  if (!report.dsPrescan || report.dsPrescan.length === 0) return '';

  const rows = report.dsPrescan.map(entry => `
    <tr>
      <td>${esc(entry.dsName)}</td>
      <td class="num">${entry.totalFamilies}</td>
      <td class="num">${entry.totalComponents}</td>
      <td>
        <div class="bar-wrap">
          <span>${entry.familiesCoveredInScan}/${entry.totalFamilies}</span>
          ${bar(entry.coveragePct)}
          <span>${pct(entry.coveragePct)}</span>
        </div>
      </td>
    </tr>`).join('');

  return `
  <div class="section">
    <div class="section-title">🎨 Design System Catalog</div>
    <table>
      <thead><tr><th>Design System</th><th>Families</th><th>Components</th><th>Scan Coverage</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildLibraryPrescan(report: ScanReport): string {
  if (!report.libraryPrescan || report.libraryPrescan.length === 0) return '';

  const rows = report.libraryPrescan.map(lib => {
    const libPct = lib.totalFamilies > 0
      ? (lib.dsBackedFamilies / lib.totalFamilies) * 100
      : 0;
    return `
    <tr>
      <td>${esc(lib.package)}</td>
      <td class="muted">${esc(lib.backedBy)}</td>
      <td class="num">${lib.dsBackedFamilies} / ${lib.totalFamilies}</td>
      <td>
        <div class="bar-wrap">
          ${bar(libPct)}
          <span>${pct(libPct)}</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">📚 Library Pre-Scan</div>
    <table>
      <thead><tr><th>Package</th><th>Backed by DS</th><th>DS-backed / Total Families</th><th>Coverage</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildCategoryBreakdown(report: ScanReport): string {
  const { summary } = report;
  const excludeLocal = report.meta.excludeLocalFromAdoption;
  const excludeUniqueLocal = report.meta.excludeUniqueLocalFromAdoption;

  const dsTotal = summary.designSystemTotal.instances;
  const libTotal = summary.localLibrary.instances;
  const locReusable = summary.localReusable.instances;
  const locUnique = summary.localUnique.instances;
  const locTotal = locReusable + locUnique;
  const tpTotal = summary.thirdParty.instances;
  const htmlTotal = summary.htmlNative.instances;
  const allTotal = dsTotal + libTotal + locTotal + tpTotal + htmlTotal;

  function segPct(n: number) {
    if (allTotal === 0) return 0;
    return (n / allTotal) * 100;
  }
  function showPct(n: number) {
    if (allTotal === 0) return '0.0%';
    return pct((n / allTotal) * 100);
  }

  const localInDenominator = excludeLocal ? 0
    : excludeUniqueLocal ? locReusable
    : locTotal;
  const denominator = dsTotal + libTotal + localInDenominator;
  function sharePct(n: number) {
    if (denominator === 0) return '—';
    return pct((n / denominator) * 100);
  }

  const segments = [
    { label: 'Design System', value: dsTotal, color: 'var(--ds)' },
    { label: 'Local Library', value: libTotal, color: 'var(--lib)' },
    { label: 'Local/Custom', value: locTotal, color: 'var(--loc)' },
    { label: 'Third-party', value: tpTotal, color: '#94a3b8' },
    { label: 'HTML native', value: htmlTotal, color: '#cbd5e1' },
  ].filter(s => s.value > 0);

  const stackedSegs = segments.map(s => {
    const w = segPct(s.value).toFixed(1);
    const label = parseFloat(w) > 8 ? s.label : '';
    return `<div class="stacked-seg" style="width:${w}%;background:${s.color}" title="${s.label}: ${num(s.value)} (${showPct(s.value)})">${label}</div>`;
  }).join('');

  const catHasFamilies = summary.designSystems.some(ds => ds.totalFamilies !== undefined);
  const localTotalUnique = summary.localReusable.uniqueComponents + summary.localUnique.uniqueComponents;

  const dsRows = summary.designSystems.map(ds => {
    const familyCell = ds.totalFamilies !== undefined
      ? `${ds.familiesUsed}/${ds.totalFamilies} (${pct(ds.familyCoverage ?? 0)})`
      : `${ds.uniqueComponents}`;
    return `
    <tr>
      <td>&nbsp;&nbsp;↳ ${esc(ds.name)}</td>
      <td class="num">${num(ds.instances)}</td>
      <td class="num">${familyCell}</td>
      <td class="num">${sharePct(ds.instances)}</td>
    </tr>`;
  }).join('');

  const familiesHeader = catHasFamilies ? 'Families Used' : 'Unique';

  const localSubRows = locTotal > 0 ? `
        <tr>
          <td class="muted" style="padding-left:24px">↳ Reusable (≥2 files)</td>
          <td class="num muted">${num(locReusable)}</td>
          <td class="num muted">${summary.localReusable.uniqueComponents}</td>
          <td class="num muted">${excludeLocal ? 'excluded' : excludeUniqueLocal ? sharePct(locReusable) : '—'}</td>
        </tr>
        <tr>
          <td class="muted" style="padding-left:24px">↳ Unique (1 file)</td>
          <td class="num muted">${num(locUnique)}</td>
          <td class="num muted">${summary.localUnique.uniqueComponents}</td>
          <td class="num muted">${excludeLocal || excludeUniqueLocal ? 'excluded' : '—'}</td>
        </tr>` : '';

  return `
  <div class="section">
    <div class="section-title">📦 Category Breakdown</div>
    <div class="stacked-wrap">${stackedSegs}</div>
    <table>
      <thead><tr><th>Category</th><th>Instances</th><th>${familiesHeader}</th><th>Share of denominator</th></tr></thead>
      <tbody>
        ${dsRows}
        <tr>
          <td class="muted">Local Library</td>
          <td class="num muted">${num(libTotal)}</td>
          <td class="num muted">${summary.localLibrary.uniqueComponents}</td>
          <td class="num muted">${sharePct(libTotal)}</td>
        </tr>
        <tr>
          <td class="muted">Local/Custom</td>
          <td class="num muted">${num(locTotal)}</td>
          <td class="num muted">${localTotalUnique}</td>
          <td class="num muted">${excludeLocal ? 'excluded' : sharePct(locTotal)}</td>
        </tr>
        ${localSubRows}
        <tr>
          <td class="muted">(Third-party)</td>
          <td class="num muted">${num(tpTotal)}</td>
          <td class="num muted">${summary.thirdParty.uniqueComponents}</td>
          <td class="num muted">excluded</td>
        </tr>
        <tr>
          <td class="muted">(HTML native)</td>
          <td class="num muted">${num(htmlTotal)}</td>
          <td class="num muted">${summary.htmlNative.uniqueComponents}</td>
          <td class="num muted">excluded</td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

function buildRepositoryBreakdown(report: ScanReport): string {
  const { byRepository, summary } = report;
  if (byRepository.length === 0) return '';

  const hasTransitive = summary.effectiveAdoptionRate > summary.adoptionRate + 0.05;
  const dsCols = summary.designSystems.map(ds => ds.name);

  const dsHeaders = dsCols.map(n => `<th>${esc(n)}</th>`).join('');
  const effectiveHeader = hasTransitive ? '<th>Effective</th>' : '';

  const rows = byRepository.map(repo => {
    const dsCells = dsCols.map(dsName => {
      const ds = repo.designSystems.find(d => d.name === dsName);
      return ds
        ? `<td class="num">${adoptionBadge(ds.adoptionRate)}</td>`
        : `<td class="num muted">—</td>`;
    }).join('');

    const effectiveCell = hasTransitive
      ? `<td class="num">${adoptionBadge(repo.effectiveAdoptionRate)}</td>`
      : '';

    return `
    <tr>
      <td>${esc(repo.name)}</td>
      ${dsCells}
      <td class="num">${adoptionBadge(repo.adoptionRate)}</td>
      ${effectiveCell}
      <td class="num">${num(repo.filesScanned)}</td>
    </tr>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">🏗️ Repository Breakdown</div>
    <table>
      <thead><tr><th>Repository</th>${dsHeaders}<th>Total DS</th>${effectiveHeader}<th>Files</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildTopFamilies(report: ScanReport): string {
  const { byComponent } = report;
  const hasFamilies = byComponent.designSystems.some(ds => ds.topFamilies && ds.topFamilies.length > 0);
  if (!hasFamilies) return '';

  const maxInstances = Math.max(
    ...byComponent.designSystems.flatMap(ds => (ds.topFamilies ?? []).map(f => f.instances)),
    1
  );

  const dsSections = byComponent.designSystems.map(ds => {
    if (!ds.topFamilies || ds.topFamilies.length === 0) return '';
    const top = ds.topFamilies.slice(0, 10);
    const rows = top.map(fam => {
      const famPct = (fam.instances / maxInstances) * 100;
      const subcomps = fam.components.length > 1
        ? `<span style="color:var(--muted);font-size:11px"> [${esc(fam.components.join(', '))}]</span>`
        : '';
      return `
      <tr>
        <td>${esc(fam.family)}${subcomps}</td>
        <td class="num">${num(fam.instances)}</td>
        <td class="num">${num(fam.filesUsedIn)}</td>
        <td><div class="bar-wrap">${bar(famPct, `${num(fam.instances)} instances`)}</div></td>
      </tr>`;
    }).join('');

    return `
    <div style="margin-bottom:20px">
      <div style="font-weight:600;color:var(--ds);margin-bottom:8px">${esc(ds.name)}</div>
      <table>
        <thead><tr><th>Family</th><th>Instances</th><th>Files</th><th>Relative usage</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">🗂️ Top Families per DS</div>
    ${dsSections}
  </div>`;
}

function buildTopComponents(report: ScanReport, hasFamilies: boolean): string {
  const { byComponent } = report;
  const hasComponents = byComponent.designSystems.some(ds => ds.components.length > 0);
  if (!hasComponents) return '';

  const title = hasFamilies ? '📋 Top Components per DS (detail)' : '🏆 Top Components per DS';
  const topN = hasFamilies ? 5 : 10;

  const dsSections = byComponent.designSystems.map(ds => {
    if (ds.components.length === 0) return '';
    const top = ds.components.slice(0, topN);
    const rows = top.map(comp => `
      <tr>
        <td>${esc(comp.name)}</td>
        <td class="num">${num(comp.instances)}</td>
        <td class="num">${num(comp.filesUsedIn)}</td>
        ${comp.packageName ? `<td class="muted">${esc(comp.packageName)}</td>` : '<td class="muted">—</td>'}
      </tr>`).join('');

    return `
    <div style="margin-bottom:20px">
      <div style="font-weight:600;color:var(--ds);margin-bottom:8px">${esc(ds.name)}</div>
      <table>
        <thead><tr><th>Component</th><th>Instances</th><th>Files</th><th>Package</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">${title}</div>
    ${dsSections}
  </div>`;
}

function buildLocalFamilies(report: ScanReport): string {
  const families = report.byComponent.localTopFamilies;
  if (!families || families.length === 0) return '';

  const maxInstances = Math.max(...families.map(f => f.instances), 1);
  const rows = families.slice(0, 15).map(fam => {
    const famPct = (fam.instances / maxInstances) * 100;
    return `
    <tr>
      <td>${esc(fam.family)}</td>
      <td class="num">${num(fam.components.length)}</td>
      <td class="num">${num(fam.instances)}</td>
      <td class="num">${num(fam.filesUsedIn)}</td>
      <td><div class="bar-wrap">${bar(famPct, `${num(fam.instances)} instances`)}</div></td>
    </tr>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">🗂️ Local Component Families</div>
    <table>
      <thead><tr><th>Family</th><th>Components</th><th>Instances</th><th>Files</th><th>Relative usage</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildReuseOpportunities(report: ScanReport): string {
  const reuse = report.localReuseAnalysis;
  if (reuse.localReuseCount + reuse.crossRepoCount === 0) return '';

  const hasCrossRepo = reuse.crossRepoCount > 0;

  const summary = [
    `${num(reuse.totalTracked)} unique tracked`,
    `${num(reuse.singletonCount)} singletons`,
    reuse.localReuseCount > 0 ? `<span style="color:var(--warn)">${num(reuse.localReuseCount)} local-reuse</span>` : null,
    reuse.crossRepoCount > 0 ? `<span style="color:var(--ok)">${num(reuse.crossRepoCount)} cross-repo</span>` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const reposHeader = hasCrossRepo ? '<th>Repos</th>' : '';
  const top = reuse.topCandidates.slice(0, 15);
  const rows = top.map(g => {
    const reposCell = hasCrossRepo
      ? `<td class="num" style="color:${g.reposUsedIn > 1 ? 'var(--ok)' : 'var(--muted)'}">${g.reposUsedIn}</td>`
      : '';
    return `
    <tr>
      <td>${esc(g.componentName)}</td>
      <td class="num">${num(g.instances)}</td>
      <td class="num">${num(g.filesUsedIn)}</td>
      ${reposCell}
    </tr>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-title">♻️ Reuse Opportunities</div>
    <p style="margin-bottom:12px;color:var(--muted);font-size:13px">${summary}</p>
    <table>
      <thead><tr><th>Component</th><th>Instances</th><th>Files</th>${reposHeader}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function buildFooter(report: ScanReport): string {
  const dur = (report.meta.scanDurationMs / 1000).toFixed(1);
  return `
  <div class="footer">
    <span>⏱ Scanned ${num(report.meta.filesScanned)} files in ${dur}s</span>
    <span>ds-adoption-scanner v${report.meta.version}</span>
  </div>`;
}

// ─── Main renderer ────────────────────────────────────────────────────────────

export function formatHTML(report: ScanReport): string {
  const { byComponent } = report;
  const hasFamilies = byComponent.designSystems.some(ds => ds.topFamilies && ds.topFamilies.length > 0);

  const body = [
    buildHeader(report),
    buildHeroCards(report),
    buildDSCards(report),
    buildDSCatalog(report),
    buildLibraryPrescan(report),
    buildCategoryBreakdown(report),
    buildRepositoryBreakdown(report),
    buildTopFamilies(report),
    buildTopComponents(report, hasFamilies),
    buildLocalFamilies(report),
    buildReuseOpportunities(report),
    buildFooter(report),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DS Adoption Report</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="page">
${body}
  </div>
</body>
</html>`;
}

export function writeHTML(report: ScanReport, outputPath: string): void {
  const dir = path.dirname(outputPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, formatHTML(report), 'utf-8');
}
