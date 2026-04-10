// src/output/html-reporter-v2.ts
// V2 HTML reporter — detailed analytical dashboard
// Self-contained: no external JS/CSS dependencies

import fs from 'node:fs';
import path from 'node:path';
import type {
  ScanReportV2,
  RouteMetrics,
  LocalComponentProfile,
} from '../domain/types.js';

// ── Small helpers ─────────────────────────────────────────────────────────────

const pct = (n: number) => n.toFixed(1) + '%';
const num = (n: number) => n.toLocaleString('en-US');
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function adoptionColor(n: number): string {
  return n >= 70 ? 'var(--ok)' : n >= 40 ? 'var(--warn)' : 'var(--bad)';
}
function shadowColor(n: number): string {
  return n >= 30 ? 'var(--bad)' : n >= 15 ? 'var(--warn)' : 'var(--ok)';
}
function adoptionClass(n: number): string {
  return n >= 70 ? 'c-ok' : n >= 40 ? 'c-warn' : 'c-bad';
}

function badge(n: number, shadow = false): string {
  const c = shadow ? shadowColor(n) : adoptionColor(n);
  return `<span class="bdg" style="background:${c}">${pct(n)}</span>`;
}

function hBar(n: number, shadow = false): string {
  const cls = shadow ? 'c-shadow' : adoptionClass(n);
  return `<span class="${cls}" style="font-weight:700;font-variant-numeric:tabular-nums">${pct(n)}</span>`;
}

function confDot(c: string): string {
  return `<span class="cdot cdot-${esc(c)}" title="${esc(c)} confidence"></span>`;
}
function proxyTag(p: boolean): string {
  return p ? '<span class="ptag">proxy</span>' : '<span class="etag">exact</span>';
}
function sigBadge(type: string, strength: string, evidence: string): string {
  return `<span class="sig sig-${esc(strength)}" title="${esc(evidence)}">${esc(type)}</span>`;
}

function hmStyle(a: number): { bg: string; text: string } {
  if (a >= 70) return { bg: '#d1fae5', text: '#065f46' };
  if (a >= 50) return { bg: '#fef9c3', text: '#713f12' };
  if (a >= 30) return { bg: '#ffedd5', text: '#7c2d12' };
  return { bg: '#fee2e2', text: '#7f1d1d' };
}

function collectRoutes(report: ScanReportV2): (RouteMetrics & { repoName: string })[] {
  const out: (RouteMetrics & { repoName: string })[] = [];
  for (const repo of report.byRepository) {
    for (const rt of repo.routes ?? []) {
      out.push({ ...rt, repoName: report.byRepository.length > 1 ? repo.name : '' });
    }
  }
  return out;
}

/** Routes that have at least one adoption or shadow usage (not pure-Neither). */
function hasUIContent(rt: RouteMetrics): boolean {
  return (rt.buckets.adoption.instances + rt.buckets.shadow.instances) > 0;
}

function repoSelectOptions(repos: { name: string }[]): string {
  if (repos.length <= 1) return '';
  return repos
    .map(r => `<option value="${esc(r.name)}">${esc(r.name)}</option>`)
    .join('');
}

function repoFilterSelect(id: string, repos: { name: string }[], onchange: string): string {
  if (repos.length <= 1) return '';
  return `
<div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:14px">
  <label style="font-size:12px;color:var(--muted);font-weight:600">Repo</label>
  <select id="${id}" class="filter-inp" style="width:auto;padding:6px 10px" onchange="${onchange}">
    <option value="">All repos</option>
    ${repoSelectOptions(repos)}
  </select>
</div>`;
}

function repoShadow(
  report: ScanReportV2,
  repoPath: string,
): LocalComponentProfile[] {
  return report.byComponent.shadow.filter(p =>
    p.resolvedPath.replace(/\\/g, '/').startsWith(repoPath.replace(/\\/g, '/'))
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
:root{
  --ds:#4f46e5;--shadow:#7c3aed;--neither:#94a3b8;
  --ok:#16a34a;--warn:#d97706;--bad:#dc2626;
  --bg:#f1f5f9;--card:#fff;--border:#e2e8f0;
  --text:#0f172a;--muted:#64748b;--head:#1e293b;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;background:var(--bg);color:var(--text);line-height:1.5}

/* Layout */
.sticky{position:sticky;top:0;z-index:100;box-shadow:0 1px 4px rgba(0,0,0,.12)}
.page{max-width:1440px;margin:0 auto;padding:0 20px 48px}

/* Header */
.app-header{background:var(--head);color:#fff;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.app-header h1{font-size:17px;font-weight:700;letter-spacing:-.3px}
.app-header-meta{font-size:12px;opacity:.65;text-align:right}

/* Tabs */
.tab-bar{background:var(--card);border-bottom:2px solid var(--border);padding:0 20px;display:flex;gap:2px;overflow-x:auto}
.tab-btn{padding:11px 16px;font-size:13px;font-weight:600;color:var(--muted);background:none;border:none;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap;transition:color .15s}
.tab-btn:hover{color:var(--text)}
.tab-btn.active{color:var(--ds);border-bottom-color:var(--ds)}
.tab-panel{padding:24px 0;display:none}
.tab-panel.active{display:block}

/* Hero */
.hero{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px}
@media(max-width:700px){.hero{grid-template-columns:1fr}}
.metric-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px}
.mc-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:6px}
.mc-value{font-size:38px;font-weight:700;line-height:1;margin-bottom:8px}
.mc-sub{font-size:12px;color:var(--muted)}
.mc-formula{font-size:11px;color:var(--muted);margin-top:4px;font-family:'Courier New',monospace}
.c-ok{color:var(--ok)}.c-warn{color:var(--warn)}.c-bad{color:var(--bad)}.c-shadow{color:var(--shadow)}.c-neither{color:var(--neither)}

/* Section */
.section{margin-bottom:32px}
.section-title{font-size:15px;font-weight:700;color:var(--head);margin-bottom:14px;display:flex;align-items:center;gap:10px}
.section-sub{font-size:12px;font-weight:400;color:var(--muted)}

/* Bucket counts (text only, no bars) */

/* Table */
.tw{overflow-x:auto;border-radius:10px;border:1px solid var(--border)}
table{width:100%;border-collapse:collapse;background:var(--card);font-size:13px}
thead th{background:var(--head);color:#fff;padding:10px 14px;text-align:left;font-size:12px;font-weight:600;letter-spacing:.04em;white-space:nowrap;user-select:none}
thead th.sh{cursor:pointer}
thead th.sh:hover{background:#2d3f55}
thead th.sa::after{content:' ↑'}
thead th.sd::after{content:' ↓'}
tbody tr.dr{cursor:pointer}
tbody tr.dr:nth-child(4n+3),tbody tr.dr:nth-child(4n+4){background:#f8fafc}
tbody tr.dr:hover{background:#eef2ff}
td{padding:9px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
tbody tr:last-child td{border-bottom:none}
td.r{text-align:right;font-variant-numeric:tabular-nums}
td.m{color:var(--muted)}

/* Expand rows */
.xrow{display:none}
.xrow.open{display:table-row}
.xrow td{padding:0;border-bottom:1px solid var(--border)}
.xinner{padding:14px 20px;background:#f0f4ff;display:flex;flex-wrap:wrap;gap:16px}
.xblock{min-width:160px}
.xblock-title{font-size:11px;font-weight:700;letter-spacing:.05em;margin-bottom:6px;text-transform:uppercase}
.xblock-title.a{color:var(--ds)}.xblock-title.s{color:var(--shadow)}.xblock-title.n{color:var(--muted)}
.xbtn{background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px;padding:0 6px;line-height:1;transition:transform .15s}
.xbtn.open{transform:rotate(90deg)}

/* Chips */
.chip{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;margin:2px}
.chip-a{background:#e0e7ff;color:#3730a3}
.chip-s{background:#ede9fe;color:#5b21b6}

/* Signals */
.sig{display:inline-block;padding:2px 7px;border-radius:8px;font-size:11px;font-weight:600;margin:2px;cursor:default}
.sig-strong{background:#dc2626;color:#fff}
.sig-moderate{background:#d97706;color:#fff}
.sig-weak{background:#94a3b8;color:#fff}

/* Tags */
.ptag{font-size:10px;padding:2px 5px;border-radius:3px;background:var(--warn);color:#fff;text-transform:uppercase;letter-spacing:.04em}
.etag{font-size:10px;padding:2px 5px;border-radius:3px;background:var(--ok);color:#fff;text-transform:uppercase;letter-spacing:.04em}
.bdg{display:inline-block;padding:2px 8px;border-radius:10px;color:#fff;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}

/* Confidence dot */
.cdot{width:8px;height:8px;border-radius:50%;display:inline-block;vertical-align:middle}
.cdot-high{background:var(--ok)}.cdot-medium{background:var(--warn)}.cdot-low{background:var(--bad)}

/* Heatmap */
.heatmap{display:flex;flex-wrap:wrap;gap:8px}
.hm-tile{width:148px;min-height:76px;padding:10px 12px;border-radius:8px;cursor:default;transition:transform .1s,box-shadow .1s;position:relative}
.hm-tile:hover{transform:scale(1.04);box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:1}
.hm-route{font-size:11px;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.8}
.hm-pct{font-size:22px;font-weight:700;line-height:1.1}
.hm-shadow{font-size:11px;margin-top:4px;opacity:.75}
.hm-conf{position:absolute;top:8px;right:8px;width:6px;height:6px;border-radius:50%}
.hm-neither{opacity:.65}

/* Repo list */
.rgrid{display:flex;flex-direction:column;gap:8px}
.rcard{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:box-shadow .15s}
.rcard:hover{box-shadow:0 2px 12px rgba(0,0,0,.07)}
.rcard.expanded{border-color:var(--ds);box-shadow:0 4px 20px rgba(79,70,229,.1)}
.rcard-head{display:flex;align-items:center;gap:0;padding:14px 20px;cursor:pointer;user-select:none}
.rcard-toggle{font-size:11px;color:var(--muted);margin-right:12px;transition:transform .2s;flex-shrink:0}
.rcard.expanded .rcard-toggle{transform:rotate(90deg)}
.rname{font-size:14px;font-weight:700;color:var(--head);min-width:200px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0}
.rmetrics{display:flex;gap:28px;margin:0 28px;flex:1}
.rm-item{display:flex;flex-direction:column;align-items:flex-start}
.rm-val{font-size:22px;font-weight:700;line-height:1.1}
.rm-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.rmeta{font-size:11px;color:var(--muted);flex-shrink:0;text-align:right;line-height:1.7}
.rdetail{display:none;padding:20px 24px;background:#f8fafc;border-top:1px solid var(--border)}
.rcard.expanded .rdetail{display:block}
.rdetail-cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media(max-width:900px){.rdetail-cols{grid-template-columns:1fr}}
.rdetail-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px;margin-top:16px}
.rdetail-title:first-child{margin-top:0}

/* Filter */
.filter-wrap{margin-bottom:14px}
.filter-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;align-items:center}
.filter-inp{width:100%;max-width:340px;padding:8px 14px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--card);color:var(--text);outline:none}
.filter-inp:focus{border-color:var(--ds);box-shadow:0 0 0 3px #e0e7ff}
.filter-lbl{font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap}
.conf-pills{display:inline-flex;gap:3px}
.conf-pill{padding:5px 11px;border-radius:6px;border:1px solid var(--border);background:var(--card);cursor:pointer;font-size:12px;font-weight:600;color:var(--muted);transition:all .12s}
.conf-pill:hover{border-color:var(--ds);color:var(--ds)}
.conf-pill.active{background:var(--ds);color:#fff;border-color:var(--ds)}

/* Resolver tags */
.rtag{display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:.03em;vertical-align:middle;margin-left:3px}
.rtag-rr{background:#dbeafe;color:#1d4ed8}
.rtag-nj{background:#f0fdf4;color:#15803d}
.rtag-pp{background:#fef9c3;color:#854d0e}
.rtag-fb{background:#f1f5f9;color:#64748b}

/* Misc */
.hidden{display:none!important}
.faded{color:var(--muted);font-size:12px}
.mt8{margin-top:8px}
.mb12{margin-bottom:12px}
.inv-ok{color:var(--ok);font-weight:700}
.inv-fail{color:var(--bad);font-weight:700}
`;

// ── JavaScript ────────────────────────────────────────────────────────────────

const JS = `
function showTab(id) {
  document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  var panel = document.getElementById(id);
  if (panel) panel.classList.add('active');
  var btn = document.querySelector('[data-tab="' + id + '"]');
  if (btn) btn.classList.add('active');
}

function showRepo(idx) {
  showTab('tab-repos');
  var card = document.getElementById('rc-' + idx);
  if (card && !card.classList.contains('expanded')) card.classList.add('expanded');
  setTimeout(function() { if(card) card.scrollIntoView({behavior:'smooth',block:'start'}); }, 100);
}

function toggleRow(row, xid) {
  var xrow = document.getElementById(xid);
  var btn = row.querySelector('.xbtn');
  var open = xrow.classList.toggle('open');
  if (btn) btn.classList.toggle('open', open);
}

function toggleRepo(idx) {
  var card = document.getElementById('rc-' + idx);
  if (card) card.classList.toggle('expanded');
}

var _rtConf = 'high';
var _rtResolver = 'all';

function setConf(btn, val) {
  _rtConf = val;
  document.querySelectorAll('.conf-pill').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  applyRouteFilters();
}

function setResolver(btn, val) {
  _rtResolver = val;
  document.querySelectorAll('.resolver-pill').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  applyRouteFilters();
}

function applyRouteFilters() {
  var search   = (document.getElementById('rt-search') ? document.getElementById('rt-search').value : '').toLowerCase();
  var repo     = document.getElementById('rt-repo')   ? document.getElementById('rt-repo').value   : '';
  var conf     = _rtConf;
  var resolver = _rtResolver;
  document.querySelectorAll('#rt-body tr.dr').forEach(function(row) {
    var rid         = (row.dataset.rid      || '').toLowerCase();
    var rowRepo     = row.dataset.repo      || '';
    var rowConf     = row.dataset.conf      || '';
    var rowResolver = row.dataset.resolver  || '';
    var hide = false;
    if (search && !rid.includes(search)) hide = true;
    if (repo   && rowRepo !== repo)      hide = true;
    if (conf !== 'all' && rowConf !== conf) hide = true;
    if (resolver !== 'all') {
      if (resolver === 'react-router' && rowResolver !== 'react-router') hide = true;
      else if (resolver === 'nextjs' && rowResolver !== 'nextjs-pages' && rowResolver !== 'nextjs-app') hide = true;
      else if (resolver === 'other' && (rowResolver === 'react-router' || rowResolver === 'nextjs-pages' || rowResolver === 'nextjs-app')) hide = true;
    }
    row.classList.toggle('hidden', hide);
    var xid = row.dataset.xid;
    if (xid && hide) { var xr = document.getElementById(xid); if (xr) xr.classList.remove('open'); }
  });
}

function filterRoutes(inp) { applyRouteFilters(); }

function sortTable(th) {
  var table = th.closest('table');
  var tbody = table.querySelector('tbody');
  if (!tbody) return;
  var ths = Array.from(table.querySelectorAll('thead th'));
  var col = ths.indexOf(th);
  var isNum = th.dataset.type === 'num';
  var asc = th.dataset.dir !== 'asc';
  ths.forEach(function(t) { delete t.dataset.dir; t.classList.remove('sa','sd'); });
  th.dataset.dir = asc ? 'asc' : 'desc';
  th.classList.add(asc ? 'sa' : 'sd');
  var rows = Array.from(tbody.querySelectorAll('tr.dr'));
  rows.sort(function(a, b) {
    var ac = a.cells[col], bc = b.cells[col];
    var av = ac ? (ac.dataset.val || ac.textContent || '').trim() : '';
    var bv = bc ? (bc.dataset.val || bc.textContent || '').trim() : '';
    var cmp = isNum ? ((parseFloat(av) || 0) - (parseFloat(bv) || 0)) : av.localeCompare(bv);
    return asc ? cmp : -cmp;
  });
  rows.forEach(function(row) {
    tbody.appendChild(row);
    var xid = row.dataset.xid;
    if (xid) { var xrow = document.getElementById(xid); if (xrow) tbody.appendChild(xrow); }
  });
}

function filterHeatmap(sel) {
  var val = sel.value;
  document.querySelectorAll('.hm-tile').forEach(function(tile) {
    var repo = tile.dataset.repo || '';
    tile.classList.toggle('hidden', val.length > 0 && repo !== val);
  });
}

function filterShadow(sel) {
  var val = sel.value;
  document.querySelectorAll('#shadow-body tr.dr').forEach(function(row) {
    var repo = row.dataset.repo || '';
    row.classList.toggle('hidden', val.length > 0 && repo !== val);
  });
}

function filterRepoCards(inp) {
  var val = inp.value.toLowerCase();
  document.querySelectorAll('.rcard').forEach(function(card) {
    var name = (card.querySelector('.rname')?.textContent || '').toLowerCase();
    card.classList.toggle('hidden', val.length > 0 && !name.includes(val));
  });
}

document.addEventListener('DOMContentLoaded', function() {
  var highBtn = document.querySelector('.conf-pill[data-conf="high"]');
  if (highBtn) setConf(highBtn, 'high');
});
`;

// ── Header & tabs ─────────────────────────────────────────────────────────────

function buildHeader(report: ScanReportV2): string {
  const date = new Date(report.meta.timestamp).toLocaleString();
  const repos = report.meta.repositoriesScanned;
  const shadowCount = report.byComponent.shadow.length;
  const allRoutes = collectRoutes(report);

  return `
<div class="sticky">
  <div class="app-header">
    <h1>DS Adoption Report <span style="opacity:.4;font-weight:400">v2</span></h1>
    <div class="app-header-meta">
      <div>${esc(date)}</div>
      <div>${repos} repo${repos !== 1 ? 's' : ''} · ${num(report.meta.filesScanned)} files · ${(report.meta.scanDurationMs / 1000).toFixed(1)}s</div>
    </div>
  </div>
  <nav class="tab-bar">
    <button class="tab-btn active" data-tab="tab-summary" onclick="showTab('tab-summary')">Overview</button>
    <button class="tab-btn" data-tab="tab-routes" onclick="showTab('tab-routes')">Routes (${allRoutes.length})</button>
    <button class="tab-btn" data-tab="tab-repos" onclick="showTab('tab-repos')">Repos (${repos})</button>
    <button class="tab-btn" data-tab="tab-shadow" onclick="showTab('tab-shadow')">Shadow (${shadowCount})</button>
  </nav>
</div>`;
}

// ── Summary tab ───────────────────────────────────────────────────────────────

function buildHero(report: ScanReportV2): string {
  const { directAdoption, effectiveAdoptionProxy, shadowUsageProxy, bucketBreakdown } = report.summary;
  const neitherPct = pct(bucketBreakdown.neither.percentage);
  const neitherInst = num(bucketBreakdown.neither.instances);
  // Show effective card only when it differs meaningfully from direct (transitive usage present)
  const hasTransitive = Math.abs(effectiveAdoptionProxy.percentage - directAdoption.percentage) >= 0.1;
  return `
<div class="hero">
  <div class="metric-card">
    <div class="mc-label">Direct Adoption ${proxyTag(directAdoption.isProxy)}</div>
    <div class="mc-value ${adoptionClass(directAdoption.percentage)}">${pct(directAdoption.percentage)}</div>
    <div class="mc-sub">${num(directAdoption.instances)} instances · ${num(directAdoption.components)} unique components</div>
    <div class="mc-formula">${esc(directAdoption.formula)}</div>
    <div class="mc-sub" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
      Neither: <span class="c-neither" style="font-weight:600">${neitherInst} inst.</span>
      <span class="c-neither">(${neitherPct} of classified)</span>
      &mdash; excluded from metric
    </div>
  </div>
  <div class="metric-card">
    <div class="mc-label">Effective Adoption ${proxyTag(effectiveAdoptionProxy.isProxy)}</div>
    <div class="mc-value ${adoptionClass(effectiveAdoptionProxy.percentage)}">${pct(effectiveAdoptionProxy.percentage)}</div>
    <div class="mc-sub">${num(effectiveAdoptionProxy.instances)} instances · ${num(effectiveAdoptionProxy.components)} unique components</div>
    <div class="mc-formula">${esc(effectiveAdoptionProxy.formula)}</div>
    ${hasTransitive
      ? `<div class="mc-sub" style="margin-top:6px;color:var(--ds)">+${pct(effectiveAdoptionProxy.percentage - directAdoption.percentage)} via transitive DS wrappers</div>`
      : `<div class="mc-sub" style="margin-top:6px;color:var(--muted)">No transitive wrappers detected</div>`
    }
  </div>
  <div class="metric-card">
    <div class="mc-label">Shadow Usage ${proxyTag(shadowUsageProxy.isProxy)}</div>
    <div class="mc-value c-shadow">${pct(shadowUsageProxy.percentage)}</div>
    <div class="mc-sub">${num(shadowUsageProxy.instances)} instances · ${num(shadowUsageProxy.components)} candidates</div>
    <div class="mc-formula">${esc(shadowUsageProxy.formula)}</div>
    <div class="mc-sub" style="margin-top:6px;color:var(--muted)">Denom: Adoption + Shadow (${num(directAdoption.denominator.instances)} inst.)</div>
  </div>
</div>`;
}

function buildBucketSummary(report: ScanReportV2): string {
  const { adoption, shadow, neither } = report.summary.bucketBreakdown;
  return `
<div class="section mb12" style="font-size:13px;color:var(--muted);display:flex;gap:24px;flex-wrap:wrap">
  <span><span style="color:var(--ds);font-weight:700">${num(adoption.instances)}</span> adoption inst.</span>
  <span><span style="color:var(--shadow);font-weight:700">${num(shadow.instances)}</span> shadow inst.</span>
  <span><span style="font-weight:600">${num(neither.instances)}</span> neither inst. (excluded from metric)</span>
</div>`;
}

function buildHeatmap(report: ScanReportV2): string {
  const allRoutes = collectRoutes(report);
  if (allRoutes.length === 0) {
    return `<div class="section"><div class="section-title">Route Heatmap</div><p class="faded">Route resolution disabled or no routes found.</p></div>`;
  }
  // Sort: pure-Neither routes last (they have adoption=0 but no real UI), rest by adoption asc
  const sorted = [...allRoutes].sort((a, b) => {
    const aHasUI = hasUIContent(a) ? 0 : 1;
    const bHasUI = hasUIContent(b) ? 0 : 1;
    if (aHasUI !== bHasUI) return aHasUI - bHasUI;
    return a.directAdoption.percentage - b.directAdoption.percentage;
  });

  const tiles = sorted.map(rt => {
    const a = rt.directAdoption.percentage;
    const eff = rt.effectiveAdoptionProxy.percentage;
    const s = rt.shadowUsageProxy.percentage;
    const isNeitherOnly = !hasUIContent(rt);
    const hasTransitive = Math.abs(eff - a) >= 0.5;
    const { bg, text } = isNeitherOnly ? { bg: '#e2e8f0', text: '#64748b' } : hmStyle(a);
    const parts = rt.routeId.split('/').filter(Boolean);
    const label = parts.length > 2 ? '\u2026/' + parts.slice(-2).join('/') : rt.routeId || '/';
    const ttLines = [
      rt.routeId,
      isNeitherOnly ? 'Neither-only (utility/service)' : `Direct: ${pct(a)}`,
      !isNeitherOnly && hasTransitive ? `Effective: ${pct(eff)}` : '',
      isNeitherOnly ? '' : `Shadow: ${pct(s)}`,
      `Conf: ${rt.confidence}`,
      rt.resolver ? `Router: ${rt.resolver}` : '',
      rt.repoName ? `Repo: ${rt.repoName}` : '',
    ].filter(Boolean).join('&#10;');

    return `<div class="hm-tile${isNeitherOnly ? ' hm-neither' : ''}" style="background:${bg};color:${text}" data-repo="${esc(rt.repoName)}" data-resolver="${esc(rt.resolver ?? '')}" title="${esc(ttLines)}">
  <span class="hm-conf cdot cdot-${rt.confidence}"></span>
  <div class="hm-route">${esc(label)}</div>
  <div class="hm-pct">${isNeitherOnly ? '<span style="font-size:12px;opacity:.7">neither</span>' : pct(a)}</div>
  ${!isNeitherOnly && hasTransitive ? `<div class="hm-shadow" style="color:var(--ds);font-size:11px;margin-top:2px">eff ${pct(eff)}</div>` : ''}
  ${!isNeitherOnly && s > 0 ? `<div class="hm-shadow" style="color:${shadowColor(s)}">shadow ${pct(s)}</div>` : ''}
</div>`;
  }).join('');

  const uiRoutes = sorted.filter(hasUIContent).length;
  const neitherRoutes = sorted.length - uiRoutes;

  return `
<div class="section">
  <div class="section-title">Route Heatmap
    <span class="section-sub">${uiRoutes} UI routes · ${neitherRoutes > 0 ? `${neitherRoutes} utility-only (grey) · ` : ''}worst adoption first · hover for details</span>
  </div>
  ${repoFilterSelect('hm-repo-sel', report.byRepository, 'filterHeatmap(this)')}
  <div class="heatmap">${tiles}</div>
</div>`;
}

function buildTopComponents(report: ScanReportV2): string {
  const comps = [...report.byComponent.adoption]
    .sort((a, b) => b.instances - a.instances)
    .slice(0, 15);
  if (comps.length === 0) return '';
  const max = comps[0]?.instances ?? 1;

  const rows = comps.map(c => {
    const w = ((c.instances / max) * 100).toFixed(0);
    return `<tr>
      <td><strong>${esc(c.componentName)}</strong></td>
      <td class="m">${esc(c.dsName)}</td>
      <td class="r">${num(c.instances)}</td>
      <td class="r">${num(c.filesUsedIn)}</td>
      <td><span class="bar" style="width:${w}px;background:var(--ds)"></span></td>
    </tr>`;
  }).join('');

  return `
<div class="section">
  <div class="section-title">Top DS Components Used</div>
  <div class="tw">
    <table>
      <thead><tr>
        <th>Component</th><th>Design System</th>
        <th class="r">Instances</th><th class="r">Files</th><th>Usage</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

function buildReposSummaryTable(report: ScanReportV2): string {
  if (report.byRepository.length <= 1) return '';

  const sorted = [...report.byRepository].sort(
    (a, b) => a.directAdoption.percentage - b.directAdoption.percentage
  );

  const rows = sorted.map((repo, origIdx) => {
    const repoIdx = report.byRepository.indexOf(repo);
    const shadowCount = repoShadow(report, repo.path).length;

    return `<tr class="dr" style="cursor:pointer" onclick="showRepo(${repoIdx})" title="Click to view repo details">
      <td><strong>${esc(repo.name)}</strong></td>
      <td data-val="${repo.directAdoption.percentage.toFixed(3)}">${hBar(repo.directAdoption.percentage)}</td>
      <td data-val="${repo.effectiveAdoptionProxy.percentage.toFixed(3)}">${hBar(repo.effectiveAdoptionProxy.percentage)}</td>
      <td data-val="${repo.shadowUsageProxy.percentage.toFixed(3)}">${hBar(repo.shadowUsageProxy.percentage, true)}</td>
      <td class="r m">${num(repo.filesScanned)}</td>
      <td class="r m">${num(repo.routes?.length ?? 0)}</td>
      <td class="r m">${num(shadowCount)}</td>
    </tr>`;
    void origIdx;
  }).join('');

  return `
<div class="section">
  <div class="section-title">Repos Overview
    <span class="section-sub">sorted by direct adoption · click to drill down</span>
  </div>
  <div class="tw">
    <table>
      <thead><tr>
        <th class="sh" data-type="str" onclick="sortTable(this)">Repo</th>
        <th class="sh" data-type="num" onclick="sortTable(this)">Direct</th>
        <th class="sh" data-type="num" onclick="sortTable(this)">Effective</th>
        <th class="sh" data-type="num" onclick="sortTable(this)">Shadow</th>
        <th class="sh r" data-type="num" onclick="sortTable(this)">Files</th>
        <th class="sh r" data-type="num" onclick="sortTable(this)">Routes</th>
        <th class="sh r" data-type="num" onclick="sortTable(this)">Shadow∆</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

function buildSummaryTab(report: ScanReportV2): string {
  const inv = report.invariants;
  const invLine = inv
    ? `<p style="margin-top:8px;font-size:12px" class="${inv.allPassed ? 'inv-ok' : 'inv-fail'}">
        Invariants: ${inv.allPassed ? 'all passed' : inv.checks.filter(c => !c.passed).map(c => c.name).join(', ') + ' failed'}
       </p>`
    : '';
  return `
<div id="tab-summary" class="tab-panel active">
  ${buildHero(report)}
  ${buildBucketSummary(report)}
  ${buildReposSummaryTable(report)}
  ${buildHeatmap(report)}
  ${buildTopComponents(report)}
  ${invLine}
</div>`;
}

// ── Routes tab ────────────────────────────────────────────────────────────────

function resolverLabel(resolver: string | undefined): string {
  if (!resolver) return '';
  if (resolver === 'react-router') return '<span class="rtag rtag-rr">React Router</span>';
  if (resolver === 'nextjs-pages') return '<span class="rtag rtag-nj">Next.js pages</span>';
  if (resolver === 'nextjs-app') return '<span class="rtag rtag-nj">Next.js app</span>';
  if (resolver === 'path-pattern') return '<span class="rtag rtag-pp">Pattern</span>';
  if (resolver === 'fallback-directory') return '<span class="rtag rtag-fb">Fallback</span>';
  return `<span class="rtag">${esc(resolver)}</span>`;
}

function buildRoutesTab(report: ScanReportV2): string {
  const allRoutes = collectRoutes(report);
  if (allRoutes.length === 0) {
    return `<div id="tab-routes" class="tab-panel"><p class="faded">No route data available.</p></div>`;
  }
  const multiRepo = allRoutes.some(r => r.repoName !== '');
  const sorted = [...allRoutes].sort((a, b) => a.directAdoption.percentage - b.directAdoption.percentage);

  // Detect which resolvers are present so we can show/hide resolver filter buttons
  const resolvers = new Set(allRoutes.map(r => r.resolver).filter(Boolean));
  const hasReactRouter = resolvers.has('react-router');
  const hasNextJS = resolvers.has('nextjs-pages') || resolvers.has('nextjs-app');

  const rows = sorted.map((rt, i) => {
    const xid = `xr${i}`;
    const adoptComps = rt.components?.adoption ?? [];
    const shadowComps = rt.components?.shadow ?? [];
    const neitherCount = rt.components?.neither?.length ?? 0;
    const hasTransitive = Math.abs(rt.effectiveAdoptionProxy.percentage - rt.directAdoption.percentage) >= 0.1;

    const adoptChips = adoptComps.slice(0, 25)
      .map(c => `<span class="chip chip-a">${esc(c)}</span>`).join('');
    const shadowChips = shadowComps.slice(0, 25)
      .map(c => `<span class="chip chip-s">${esc(c)}</span>`).join('');
    const moreA = adoptComps.length > 25 ? `<span class="faded"> +${adoptComps.length - 25} more</span>` : '';
    const moreS = shadowComps.length > 25 ? `<span class="faded"> +${shadowComps.length - 25} more</span>` : '';

    const dataRow = `<tr class="dr" data-rid="${esc(rt.routeId)}" data-xid="${xid}" data-conf="${rt.confidence}" data-repo="${esc(rt.repoName)}" data-resolver="${esc(rt.resolver ?? '')}" onclick="toggleRow(this,'${xid}')">
      <td><button class="xbtn" onclick="event.stopPropagation();toggleRow(this.closest('tr'),'${xid}')">▶</button> ${esc(rt.routeId)}</td>
      ${multiRepo ? `<td class="m">${esc(rt.repoName)}</td>` : ''}
      <td>${confDot(rt.confidence)} ${resolverLabel(rt.resolver)}</td>
      <td data-val="${rt.directAdoption.percentage.toFixed(3)}">${hBar(rt.directAdoption.percentage)}</td>
      <td data-val="${rt.effectiveAdoptionProxy.percentage.toFixed(3)}">${hasTransitive ? hBar(rt.effectiveAdoptionProxy.percentage) : '<span class="faded" style="font-size:11px">—</span>'}</td>
      <td data-val="${rt.shadowUsageProxy.percentage.toFixed(3)}">${hBar(rt.shadowUsageProxy.percentage, true)}</td>
      <td class="r">${num(rt.buckets.adoption.instances)}</td>
      <td class="r">${num(rt.buckets.adoption.components)}</td>
    </tr>`;

    const colspan = multiRepo ? 9 : 8;
    const xRow = `<tr id="${xid}" class="xrow">
      <td colspan="${colspan}">
        <div class="xinner">
          ${adoptComps.length > 0 ? `
          <div class="xblock">
            <div class="xblock-title a">Adoption (${adoptComps.length})</div>
            <div>${adoptChips}${moreA}</div>
          </div>` : ''}
          ${shadowComps.length > 0 ? `
          <div class="xblock">
            <div class="xblock-title s">Shadow (${shadowComps.length})</div>
            <div>${shadowChips}${moreS}</div>
          </div>` : ''}
          ${neitherCount > 0 ? `
          <div class="xblock">
            <div class="xblock-title n">Neither</div>
            <div class="faded">${neitherCount} component${neitherCount !== 1 ? 's' : ''} — utilities/wrappers, excluded from metrics</div>
          </div>` : ''}
        </div>
      </td>
    </tr>`;
    return dataRow + xRow;
  }).join('');

  const repoOpts = multiRepo
    ? `<option value="">All repos</option>` + report.byRepository.map(r => `<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('')
    : '';

  return `
<div id="tab-routes" class="tab-panel">
  <div class="filter-row">
    <input id="rt-search" class="filter-inp" type="search" placeholder="Filter by route path…" oninput="applyRouteFilters()"/>
    ${multiRepo ? `<span class="filter-lbl">Repo</span>
    <select id="rt-repo" class="filter-inp" style="width:auto;padding:6px 10px" onchange="applyRouteFilters()">
      ${repoOpts}
    </select>` : ''}
    <span class="filter-lbl" title="Filter by route resolution confidence">Confidence</span>
    <div class="conf-pills">
      <button class="conf-pill" data-conf="all"
        title="Show all routes regardless of how they were resolved"
        onclick="setConf(this,'all')">All</button>
      <button class="conf-pill" data-conf="high"
        title="High confidence — routes resolved from Next.js pages/, app/ or React Router config. These are real URL paths."
        onclick="setConf(this,'high')">High ✓</button>
      <button class="conf-pill" data-conf="medium"
        title="Medium confidence — routes from custom path patterns. Likely real but may have edge cases."
        onclick="setConf(this,'medium')">Medium</button>
      <button class="conf-pill" data-conf="low"
        title="Low confidence — fallback directory grouping. No router config found; paths are guesses based on folder names."
        onclick="setConf(this,'low')">Low</button>
    </div>
    ${hasReactRouter || hasNextJS ? `<span class="filter-lbl" title="Filter by which router detected the route">Router</span>
    <div class="conf-pills">
      <button class="resolver-pill conf-pill active" data-conf="all" onclick="setResolver(this,'all')">All</button>
      ${hasReactRouter ? `<button class="resolver-pill conf-pill" onclick="setResolver(this,'react-router')" title="Only routes found in createBrowserRouter / JSX Route config">React Router</button>` : ''}
      ${hasNextJS ? `<button class="resolver-pill conf-pill" onclick="setResolver(this,'nextjs')" title="Only routes from Next.js pages/ or app/ filesystem convention">Next.js</button>` : ''}
      ${resolvers.size > 0 && (resolvers.has('path-pattern') || resolvers.has('fallback-directory')) ? `<button class="resolver-pill conf-pill" onclick="setResolver(this,'other')" title="Pattern-matched or fallback-directory routes (no explicit router config)">Other</button>` : ''}
    </div>` : ''}
  </div>
  <p class="faded" style="margin-bottom:12px;font-size:12px">
    <strong>High</strong> — resolved from Next.js pages/ or React Router config (real URL paths) &nbsp;·&nbsp;
    <strong>Medium</strong> — custom path patterns &nbsp;·&nbsp;
    <strong>Low</strong> — fallback directory grouping (no router config found, paths are estimates)
  </p>
  <div class="tw">
    <table>
      <thead><tr>
        <th class="sh" data-type="str" onclick="sortTable(this)">Route</th>
        ${multiRepo ? '<th class="sh" data-type="str" onclick="sortTable(this)">Repo</th>' : ''}
        <th>Conf. / Router</th>
        <th class="sh" data-type="num" onclick="sortTable(this)">Direct</th>
        <th class="sh" data-type="num" onclick="sortTable(this)">Effective</th>
        <th class="sh" data-type="num" onclick="sortTable(this)">Shadow</th>
        <th class="sh r" data-type="num" onclick="sortTable(this)">Inst.</th>
        <th class="sh r" data-type="num" onclick="sortTable(this)">Comps</th>
      </tr></thead>
      <tbody id="rt-body">${rows}</tbody>
    </table>
  </div>
</div>`;
}

// ── Repos tab ─────────────────────────────────────────────────────────────────

function buildReposTab(report: ScanReportV2): string {
  const cards = report.byRepository.map((repo, i) => {
    const worstRoutes = [...(repo.routes ?? [])]
      .filter(hasUIContent)
      .sort((a, b) => a.directAdoption.percentage - b.directAdoption.percentage)
      .slice(0, 10);

    const bestRoutes = [...(repo.routes ?? [])]
      .filter(hasUIContent)
      .sort((a, b) => b.directAdoption.percentage - a.directAdoption.percentage)
      .slice(0, 5);

    const shadow = repoShadow(report, repo.path);
    const topShadow = shadow.slice(0, 10);

    const hasEffective = Math.abs(repo.effectiveAdoptionProxy.percentage - repo.directAdoption.percentage) >= 0.1;

    const miniRouteRows = (routes: typeof worstRoutes) => routes.map(rt => `<tr>
      <td style="font-size:12px;max-width:240px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis" title="${esc(rt.routeId)}">${esc(rt.routeId)}</td>
      <td class="r">${badge(rt.directAdoption.percentage)}</td>
      <td class="r">${badge(rt.shadowUsageProxy.percentage, true)}</td>
      <td class="r m" style="font-size:11px">${num(rt.buckets.adoption.instances + rt.buckets.shadow.instances)}</td>
    </tr>`).join('');

    const shadowChips = topShadow
      .map(p => `<span class="chip chip-s" title="${esc(p.signals.map(s => s.type).join(', '))}">${esc(p.componentName)}</span>`).join('');
    const moreShadow = shadow.length > 10
      ? `<span class="faded"> +${shadow.length - 10} more</span>` : '';

    // Top DS components
    const topComps = (repo.designSystems ?? [])
      .flatMap(ds => (ds.topComponents ?? []).map(c => ({ ...c, dsName: ds.name })))
      .sort((a, b) => b.instances - a.instances)
      .slice(0, 8);

    const compChips = topComps.map(c =>
      `<span class="chip chip-a" title="${esc(c.dsName)} · ${c.instances} uses">${esc(c.name)}</span>`
    ).join('');

    // DS table (if multiple DS)
    const dsRows = (repo.designSystems ?? []).length > 1
      ? (repo.designSystems ?? []).map(ds => `<tr>
          <td style="font-size:12px">${esc(ds.name)}</td>
          <td class="r">${badge(ds.directAdoption.percentage)}</td>
          <td class="r m" style="font-size:12px">${num(ds.directAdoption.instances)}</td>
        </tr>`).join('')
      : null;

    const routeTable = (routes: typeof worstRoutes, title: string) => `
      <div class="rdetail-title">${title}</div>
      <div class="tw"><table>
        <thead><tr>
          <th>Route</th>
          <th class="r">Direct</th>
          <th class="r">Effective</th>
          <th class="r">Shadow</th>
          <th class="r" style="min-width:60px">Inst.</th>
        </tr></thead>
        <tbody>${routes.map(rt => {
          const hasEff = Math.abs(rt.effectiveAdoptionProxy.percentage - rt.directAdoption.percentage) >= 0.1;
          return `<tr>
          <td style="font-size:12px;max-width:260px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis" title="${esc(rt.routeId)}">${resolverLabel(rt.resolver)}${esc(rt.routeId)}</td>
          <td class="r">${badge(rt.directAdoption.percentage)}</td>
          <td class="r">${hasEff ? badge(rt.effectiveAdoptionProxy.percentage) : '<span class="faded">—</span>'}</td>
          <td class="r">${rt.buckets.shadow.instances > 0 ? badge(rt.shadowUsageProxy.percentage, true) : '<span class="faded">—</span>'}</td>
          <td class="r m" style="font-size:12px">${num(rt.buckets.adoption.instances + rt.buckets.shadow.instances)}</td>
        </tr>`;
        }).join('')}</tbody>
      </table></div>`;

    return `
<div class="rcard" id="rc-${i}">
  <div class="rcard-head" onclick="toggleRepo(${i})">
    <span class="rcard-toggle">▶</span>
    <div class="rname" title="${esc(repo.name)}">${esc(repo.name)}</div>
    <div class="rmetrics">
      <div class="rm-item">
        <div class="rm-val ${adoptionClass(repo.directAdoption.percentage)}">${pct(repo.directAdoption.percentage)}</div>
        <div class="rm-lbl">direct adoption</div>
      </div>
      ${hasEffective ? `<div class="rm-item">
        <div class="rm-val ${adoptionClass(repo.effectiveAdoptionProxy.percentage)}">${pct(repo.effectiveAdoptionProxy.percentage)}</div>
        <div class="rm-lbl">effective</div>
      </div>` : ''}
      <div class="rm-item">
        <div class="rm-val c-shadow">${pct(repo.shadowUsageProxy.percentage)}</div>
        <div class="rm-lbl">shadow</div>
      </div>
    </div>
    <div class="rmeta">
      ${num(repo.filesScanned)} files<br>
      ${num(repo.routes?.length ?? 0)} routes<br>
      ${num(shadow.length)} shadow · ${num(repo.bucketBreakdown.neither.instances)} neither
    </div>
  </div>
  <div class="rdetail">
    ${compChips.length > 0 ? `
    <div class="rdetail-title">Top DS components used</div>
    <div style="margin-bottom:16px">${compChips}</div>` : ''}

    ${dsRows ? `
    <div class="rdetail-title">Per design system</div>
    <div class="tw" style="max-width:480px;margin-bottom:16px"><table>
      <thead><tr><th>DS</th><th class="r">Direct</th><th class="r">Instances</th></tr></thead>
      <tbody>${dsRows}</tbody>
    </table></div>` : ''}

    ${worstRoutes.length > 0 ? `
    <div class="rdetail-cols">
      <div>
        ${routeTable(worstRoutes, `Lowest adoption routes (${worstRoutes.length})`)}
      </div>
      <div>
        ${bestRoutes.length > 0 && bestRoutes[0].directAdoption.percentage < 100
          ? routeTable(bestRoutes, `Best adoption routes (${bestRoutes.length})`)
          : topShadow.length > 0
            ? `<div class="rdetail-title">Shadow candidates (${shadow.length})</div><div>${shadowChips}${moreShadow}</div>`
            : ''}
      </div>
    </div>
    ${topShadow.length > 0 && (bestRoutes.length === 0 || bestRoutes[0].directAdoption.percentage >= 100) ? `
    <div class="rdetail-title" style="margin-top:16px">Shadow candidates (${shadow.length})</div>
    <div>${shadowChips}${moreShadow}</div>` : ''}
    ${topShadow.length > 0 && bestRoutes.length > 0 && bestRoutes[0].directAdoption.percentage < 100 ? `
    <div class="rdetail-title" style="margin-top:16px">Shadow candidates (${shadow.length})</div>
    <div>${shadowChips}${moreShadow}</div>` : ''}
    ` : `
    <div class="rdetail-cols">
      <div>
        <div class="faded">No route data for this repo.</div>
      </div>
      ${topShadow.length > 0 ? `<div>
        <div class="rdetail-title">Shadow candidates (${shadow.length})</div>
        <div>${shadowChips}${moreShadow}</div>
      </div>` : '<div></div>'}
    </div>`}
  </div>
</div>`;
  }).join('');

  return `
<div id="tab-repos" class="tab-panel">
  ${report.byRepository.length > 4 ? `
  <div class="filter-row" style="margin-bottom:16px">
    <input class="filter-inp" type="search" placeholder="Filter repos…" oninput="filterRepoCards(this)"/>
  </div>` : ''}
  <div class="rgrid">${cards}</div>
</div>`;
}

// ── Shadow tab ────────────────────────────────────────────────────────────────

function buildShadowTab(report: ScanReportV2): string {
  const shadows = [...report.byComponent.shadow].sort((a, b) => {
    const score = (p: LocalComponentProfile) =>
      p.signals.reduce((s, sg) => s + (sg.strength === 'strong' ? 3 : sg.strength === 'moderate' ? 2 : 1), 0);
    return score(b) - score(a);
  });

  if (shadows.length === 0) {
    return `<div id="tab-shadow" class="tab-panel"><p class="faded">No shadow candidates detected.</p></div>`;
  }

  // Determine which repo each shadow profile belongs to
  const repoByPath = new Map<string, string>();
  for (const repo of report.byRepository) {
    repoByPath.set(repo.path.replace(/\\/g, '/'), repo.name);
  }

  function shadowRepoName(p: LocalComponentProfile): string {
    const normalized = p.resolvedPath.replace(/\\/g, '/');
    for (const [repoPath, repoName] of repoByPath) {
      if (normalized.startsWith(repoPath.replace(/\\/g, '/'))) return repoName;
    }
    return '';
  }

  const multiRepo = report.byRepository.length > 1;

  const rows = shadows.map(p => {
    const score = p.signals.reduce(
      (s, sg) => s + (sg.strength === 'strong' ? 3 : sg.strength === 'moderate' ? 2 : 1), 0
    );
    const sigs = p.signals.map(sg => sigBadge(sg.type, sg.strength, sg.evidence)).join('');
    const repo = shadowRepoName(p);
    return `<tr class="dr" data-repo="${esc(repo)}">
      <td><strong>${esc(p.componentName)}</strong></td>
      ${multiRepo ? `<td class="m">${esc(repo)}</td>` : ''}
      <td class="r" data-val="${p.fileCount}">${p.fileCount}</td>
      <td class="r" data-val="${p.routeCount}">${p.routeCount}</td>
      <td class="r" data-val="${score}">${score}</td>
      <td>${sigs}</td>
    </tr>`;
  }).join('');

  return `
<div id="tab-shadow" class="tab-panel">
  <div class="section">
    <div class="section-title">
      Shadow Usage Candidates
      <span class="section-sub">${shadows.length} components · sorted by signal score · hover signals for AST evidence</span>
    </div>
    <p class="faded mb12">Structural candidates for parallel UI layer. Proxy metric — AST-confirmed signals, not semantic proof.</p>
    ${repoFilterSelect('sh-repo-sel', report.byRepository, 'filterShadow(this)')}
    <div class="tw">
      <table>
        <thead><tr>
          <th class="sh" data-type="str" onclick="sortTable(this)">Component</th>
          ${multiRepo ? '<th class="sh" data-type="str" onclick="sortTable(this)">Repo</th>' : ''}
          <th class="sh r" data-type="num" onclick="sortTable(this)">Files</th>
          <th class="sh r" data-type="num" onclick="sortTable(this)">Routes</th>
          <th class="sh r" data-type="num" onclick="sortTable(this)">Score</th>
          <th>Signals <span style="font-weight:400;opacity:.7">(hover for evidence)</span></th>
        </tr></thead>
        <tbody id="shadow-body">${rows}</tbody>
      </table>
    </div>
  </div>
  ${buildSignalLegend()}
</div>`;
}

function buildSignalLegend(): string {
  const rows = [
    ['substantial-markup', 'strong', 'Component source contains > N JSX elements (AST-analysed)'],
    ['reusable-local', 'moderate', 'Used in ≥ N files — indicates cross-cutting UI concern'],
    ['multi-route', 'moderate', 'Used across ≥ M routes — wide surface area'],
    ['parallel-layer', 'moderate', 'Located in a consistent UI layer directory (components/, ui/, shared/)'],
    ['ui-family', 'moderate', 'Part of a local component family (Button + ButtonGroup in same dir)'],
    ['primitive-like', 'weak', 'Name matches primitive UI pattern (Button, Input, Select…)'],
  ];
  return `
<div class="section">
  <div class="section-title">Signal Reference</div>
  <div class="tw" style="max-width:640px">
    <table>
      <thead><tr><th>Signal</th><th>Typical Strength</th><th>Description</th></tr></thead>
      <tbody>
        ${rows.map(([sig, str, desc]) =>
          `<tr><td>${esc(sig)}</td><td>${sigBadge(sig, str, '')}</td><td class="m">${esc(desc)}</td></tr>`
        ).join('')}
      </tbody>
    </table>
  </div>
</div>`;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function buildHTMLV2(report: ScanReportV2): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>DS Adoption Report · ${new Date(report.meta.timestamp).toLocaleDateString()}</title>
  <style>${CSS}</style>
</head>
<body>
${buildHeader(report)}
<div class="page">
  ${buildSummaryTab(report)}
  ${buildRoutesTab(report)}
  ${buildReposTab(report)}
  ${buildShadowTab(report)}
</div>
<script>${JS}</script>
</body>
</html>`;
}

export function writeHTMLV2(report: ScanReportV2, outputPath: string): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buildHTMLV2(report), 'utf-8');
}
