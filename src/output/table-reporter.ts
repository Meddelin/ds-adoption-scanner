import chalk from 'chalk';
import Table from 'cli-table3';
import path from 'node:path';
import type { ScanReport } from '../types.js';

function adoptionColor(rate: number): string {
  if (rate >= 70) return chalk.green(formatPct(rate));
  if (rate >= 40) return chalk.yellow(formatPct(rate));
  return chalk.red(formatPct(rate));
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function progressBar(rate: number, width = 30): string {
  const filled = Math.round((rate / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}

export function printReport(report: ScanReport, verbose = false): void {
  const { summary, meta, byRepository, byComponent } = report;
  const excludeLocal = meta.excludeLocalFromAdoption;

  // ── Header ──────────────────────────────────────────────────────────────────
  const date = new Date(meta.timestamp).toISOString().slice(0, 10);
  const title = `DS Adoption Report · ${date} · ${meta.repositoriesScanned} repo${meta.repositoriesScanned !== 1 ? 's' : ''}`;
  console.log('\n' + chalk.bold.cyan('╔' + '═'.repeat(title.length + 4) + '╗'));
  console.log(chalk.bold.cyan('║  ') + chalk.bold.white(title) + chalk.bold.cyan('  ║'));
  console.log(chalk.bold.cyan('╚' + '═'.repeat(title.length + 4) + '╝') + '\n');

  const localNote = excludeLocal ? chalk.dim(' (local excl.)') : '';

  // ── Total Adoption ───────────────────────────────────────────────────────────
  const hasTransitive = summary.effectiveAdoptionRate > summary.adoptionRate + 0.05;

  if (hasTransitive) {
    const delta = summary.effectiveAdoptionRate - summary.adoptionRate;
    console.log(
      `  ${chalk.bold('📊 Direct DS Adoption:')}   ` +
      adoptionColor(summary.adoptionRate) + localNote +
      `  ${progressBar(summary.adoptionRate)}`
    );
    console.log(
      `  ${chalk.bold('📊 Effective Adoption:')}   ` +
      adoptionColor(summary.effectiveAdoptionRate) + localNote +
      `  ${progressBar(summary.effectiveAdoptionRate)}` +
      chalk.dim(` (+${delta.toFixed(1)}% via transitive)\n`)
    );
  } else {
    console.log(
      `  ${chalk.bold('📊 Total DS Adoption:')}  ` +
      adoptionColor(summary.adoptionRate) + localNote +
      `  ${progressBar(summary.adoptionRate)}\n`
    );
  }

  // ── Per Design System ────────────────────────────────────────────────────────
  if (summary.designSystems.length > 0) {
    console.log(chalk.bold('  📐 Per Design System'));
    console.log(chalk.dim('  ' + '─'.repeat(65)));

    const showEffective = summary.designSystems.some(
      ds => ds.effectiveAdoptionRate > ds.adoptionRate + 0.05
    );
    const hasFamilyCoverage = summary.designSystems.some(ds => ds.totalFamilies !== undefined);

    const head = [
      chalk.bold('DS Name'),
      chalk.bold('Direct%'),
      ...(showEffective ? [chalk.bold('Effective%')] : []),
      ...(hasFamilyCoverage ? [chalk.bold('Families')] : []),
      chalk.bold('Instances'),
      ...(showEffective ? [chalk.bold('+Transitive')] : []),
      chalk.bold('Unique'),
      chalk.bold('Files w/ DS'),
    ];
    const colWidths = (() => {
      if (showEffective && hasFamilyCoverage) return [20, 11, 13, 18, 12, 13, 10, 14];
      if (showEffective) return [20, 11, 13, 12, 13, 10, 14];
      if (hasFamilyCoverage) return [20, 11, 18, 12, 10, 14];
      return [20, 12, 12, 10, 14];
    })();

    const dsTable = new Table({
      head,
      colWidths,
      style: { head: [], border: [], compact: true },
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    });

    for (const ds of summary.designSystems) {
      const familiesCell = ds.totalFamilies !== undefined
        ? `${ds.familiesUsed}/${ds.totalFamilies} (${formatPct(ds.familyCoverage ?? 0)})`
        : chalk.dim('—');

      dsTable.push([
        chalk.cyan(ds.name),
        adoptionColor(ds.adoptionRate),
        ...(showEffective ? [adoptionColor(ds.effectiveAdoptionRate)] : []),
        ...(hasFamilyCoverage ? [familiesCell] : []),
        formatNum(ds.instances),
        ...(showEffective
          ? [ds.transitiveInstances > 0 ? chalk.dim(`+${ds.transitiveInstances}`) : chalk.dim('—')]
          : []),
        String(ds.uniqueComponents),
        formatPct(ds.filePenetration),
      ]);
    }

    dsTable.push([
      chalk.bold('All DS total'),
      chalk.bold(adoptionColor(summary.adoptionRate)),
      ...(showEffective ? [chalk.bold(adoptionColor(summary.effectiveAdoptionRate))] : []),
      ...(hasFamilyCoverage ? [chalk.dim('')] : []),
      chalk.bold(formatNum(summary.designSystemTotal.instances)),
      ...(showEffective ? [chalk.dim('')] : []),
      chalk.bold(String(summary.designSystemTotal.uniqueComponents)),
      chalk.bold(formatPct(summary.filePenetration)),
    ]);

    console.log(dsTable.toString());
    console.log();
  }

  // ── DS Pre-Scan (Family Catalog) ─────────────────────────────────────────────
  if (report.dsPrescan && report.dsPrescan.length > 0) {
    console.log(chalk.bold('  🎨 Design System Catalog'));
    console.log(chalk.dim('  ' + '─'.repeat(65)));

    const dsCatalogTable = new Table({
      head: [
        chalk.bold('Design System'),
        chalk.bold('Families'),
        chalk.bold('Components'),
        chalk.bold('Scan Coverage'),
      ],
      colWidths: [24, 12, 14, 32],
      style: { head: [], border: [], compact: true },
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    });

    for (const entry of report.dsPrescan) {
      const bar = progressBar(entry.coveragePct, 18);
      dsCatalogTable.push([
        chalk.cyan(entry.dsName),
        String(entry.totalFamilies),
        String(entry.totalComponents),
        `${entry.familiesCoveredInScan}/${entry.totalFamilies} ${adoptionColor(entry.coveragePct)}  ${bar}`,
      ]);
    }

    console.log(dsCatalogTable.toString());
    console.log();
  }

  // ── Library Pre-Scan Results ─────────────────────────────────────────────────
  if (report.libraryPrescan && report.libraryPrescan.length > 0) {
    console.log(chalk.bold('  📚 Library Pre-Scan'));
    console.log(chalk.dim('  ' + '─'.repeat(65)));

    const libTable = new Table({
      head: [
        chalk.bold('Package'),
        chalk.bold('Backed by'),
        chalk.bold('DS / Total'),
        chalk.bold('Coverage'),
      ],
      colWidths: [36, 16, 13, 32],
      style: { head: [], border: [], compact: true },
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    });

    for (const lib of report.libraryPrescan) {
      const pct = lib.totalComponents > 0
        ? (lib.dsBackedComponents / lib.totalComponents) * 100
        : 0;
      const bar = progressBar(pct, 18);
      libTable.push([
        chalk.cyan(lib.package.slice(0, 34)),
        chalk.dim(lib.backedBy),
        chalk.dim(`${lib.dsBackedComponents} / ${lib.totalComponents}`),
        `${adoptionColor(pct)}  ${bar}`,
      ]);
    }

    console.log(libTable.toString());
    console.log();
  }

  // ── Category Breakdown ───────────────────────────────────────────────────────
  console.log(chalk.bold('  📦 Category Breakdown'));
  console.log(chalk.dim('  ' + '─'.repeat(65)));

  const denominator =
    summary.designSystemTotal.instances +
    summary.localLibrary.instances +
    (excludeLocal ? 0 : summary.local.instances);

  function sharePct(instances: number): string {
    if (denominator === 0) return '0.0%';
    return formatPct((instances / denominator) * 100);
  }

  const catTable = new Table({
    head: [
      chalk.bold('Category'),
      chalk.bold('Instances'),
      chalk.bold('Unique'),
      chalk.bold('Share'),
    ],
    colWidths: [25, 12, 10, 12],
    style: { head: [], border: [], compact: true },
    chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
  });

  for (const ds of summary.designSystems) {
    catTable.push([
      `  ├ ${chalk.cyan(ds.name)}`,
      formatNum(ds.instances),
      String(ds.uniqueComponents),
      sharePct(ds.instances),
    ]);
  }

  catTable.push([
    chalk.dim('Local Library'),
    chalk.dim(formatNum(summary.localLibrary.instances)),
    chalk.dim(String(summary.localLibrary.uniqueComponents)),
    chalk.dim(sharePct(summary.localLibrary.instances)),
  ]);

  catTable.push([
    chalk.dim('Local/Custom'),
    chalk.dim(formatNum(summary.local.instances)),
    chalk.dim(String(summary.local.uniqueComponents)),
    chalk.dim(excludeLocal ? 'excluded' : sharePct(summary.local.instances)),
  ]);

  catTable.push([
    chalk.dim('(Third-party)'),
    chalk.dim(formatNum(summary.thirdParty.instances)),
    chalk.dim(String(summary.thirdParty.uniqueComponents)),
    chalk.dim('excluded'),
  ]);

  catTable.push([
    chalk.dim('(HTML native)'),
    chalk.dim(formatNum(summary.htmlNative.instances)),
    chalk.dim(String(summary.htmlNative.uniqueComponents)),
    chalk.dim('excluded'),
  ]);

  console.log(catTable.toString());
  console.log();

  // ── Repository × DS Breakdown ────────────────────────────────────────────────
  if (byRepository.length > 0) {
    console.log(chalk.bold('  🏗️  Repository Breakdown'));
    console.log(chalk.dim('  ' + '─'.repeat(65)));

    const dsCols = summary.designSystems.map(ds => ds.name);
    const repoTable = new Table({
      head: [
        chalk.bold('Repository'),
        ...dsCols.map(n => chalk.bold(n)),
        chalk.bold('Total DS'),
        ...(hasTransitive ? [chalk.bold('Effective')] : []),
        chalk.bold('Local'),
      ],
      style: { head: [], border: [], compact: true },
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    });

    for (const repo of byRepository) {
      const dsRates = dsCols.map(dsName => {
        const ds = repo.designSystems.find(d => d.name === dsName);
        return ds ? adoptionColor(ds.adoptionRate) : chalk.dim('—');
      });

      const localShare = 100 - repo.adoptionRate;

      repoTable.push([
        repo.name.slice(0, 30),
        ...dsRates,
        adoptionColor(repo.adoptionRate),
        ...(hasTransitive ? [adoptionColor(repo.effectiveAdoptionRate)] : []),
        chalk.dim(formatPct(localShare)),
      ]);
    }

    console.log(repoTable.toString());
    console.log();
  }

  // ── Top Families per DS ──────────────────────────────────────────────────────
  const hasFamilies = byComponent.designSystems.some(ds => ds.topFamilies && ds.topFamilies.length > 0);
  if (hasFamilies) {
    console.log(chalk.bold('  🗂️  Top Families per DS'));
    console.log(chalk.dim('  ' + '─'.repeat(65)));

    for (const ds of byComponent.designSystems) {
      if (!ds.topFamilies || ds.topFamilies.length === 0) continue;
      console.log(`  ${chalk.cyan.bold(ds.name + ':')}`);

      const top = ds.topFamilies.slice(0, 10);
      for (const fam of top) {
        const subcomps = fam.components.length > 1
          ? chalk.dim(` [${fam.components.join(', ')}]`)
          : '';
        console.log(
          `    ${chalk.white(fam.family.padEnd(28))}` +
          `${formatNum(fam.instances).padStart(6)} instances   ` +
          `${String(fam.filesUsedIn).padStart(4)} files` +
          subcomps
        );
      }
      console.log();
    }
  }

  // ── Top Components per DS ────────────────────────────────────────────────────
  const hasComponents = byComponent.designSystems.some(ds => ds.components.length > 0);
  if (hasComponents) {
    console.log(chalk.bold('  🏆 Top Components per DS'));
    console.log(chalk.dim('  ' + '─'.repeat(65)));

    for (const ds of byComponent.designSystems) {
      if (ds.components.length === 0) continue;
      console.log(`  ${chalk.cyan.bold(ds.name + ':')}`);

      const top = ds.components.slice(0, 5);
      for (const comp of top) {
        console.log(
          `    ${chalk.white(comp.name.padEnd(28))} ` +
          `${formatNum(comp.instances).padStart(6)} instances   ` +
          `${String(comp.filesUsedIn).padStart(4)} files`
        );
      }
      console.log();
    }
  }

  // ── Local Reuse Opportunities ────────────────────────────────────────────────
  const reuse = report.localReuseAnalysis;
  if (reuse.localReuseCount + reuse.crossRepoCount > 0) {
    console.log(chalk.bold('  ♻️  Reuse Opportunities'));
    console.log(chalk.dim('  ' + '─'.repeat(65)));

    const hasCrossRepo = reuse.crossRepoCount > 0;
    const summary = [
      chalk.dim(`${formatNum(reuse.totalTracked)} unique tracked`),
      chalk.dim(`${formatNum(reuse.singletonCount)} singletons`),
      reuse.localReuseCount > 0 ? chalk.yellow(`${formatNum(reuse.localReuseCount)} local-reuse`) : null,
      reuse.crossRepoCount > 0 ? chalk.green(`${formatNum(reuse.crossRepoCount)} cross-repo`) : null,
    ].filter(Boolean).join(chalk.dim('  ·  '));
    console.log(`  ${summary}`);
    if (reuse.inlineCount > 0) {
      console.log(`  ${chalk.dim(`+ ${formatNum(reuse.inlineCount)} inline/anonymous (not trackable)`)}`);
    }
    console.log();

    const reuseTable = new Table({
      head: [
        chalk.bold('Component'),
        chalk.bold('Instances'),
        chalk.bold('Files'),
        ...(hasCrossRepo ? [chalk.bold('Repos')] : []),
      ],
      colWidths: hasCrossRepo ? [32, 11, 8, 7] : [36, 11, 8],
      style: { head: [], border: [], compact: true },
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    });

    const top = reuse.topCandidates.slice(0, 10);
    for (const g of top) {
      reuseTable.push([
        chalk.cyan(g.componentName.slice(0, 30)),
        formatNum(g.instances),
        String(g.filesUsedIn),
        ...(hasCrossRepo ? [g.reposUsedIn > 1 ? chalk.green(String(g.reposUsedIn)) : chalk.dim('1')] : []),
      ]);
    }

    console.log(reuseTable.toString());
    console.log();
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  console.log(chalk.dim('  ' + '─'.repeat(65)));
  printAIHint();
  console.log(
    chalk.dim(`\n  ⏱  Scanned ${formatNum(meta.filesScanned)} files in ${(meta.scanDurationMs / 1000).toFixed(1)}s\n`)
  );
}

function printAIHint(): void {
  const aiDir = 'node_modules/ds-adoption-scanner/ai-instructions';
  console.log(chalk.dim('  ─'.repeat(33)));
  console.log(`  ${chalk.bold('🤖 AI Instructions:')} ${chalk.dim(aiDir + '/')}`);
  console.log(`     • ${chalk.cyan('shadow-detection.md')}  — find duplicates of DS components`);
  console.log(`     • ${chalk.cyan('categorization.md')}    — clarify component categorization`);
  console.log(`     • ${chalk.cyan('report.md')}            — generate analytical report`);
  console.log();
  console.log(chalk.dim('  Example (Cursor / Claude Code):'));
  console.log(chalk.dim(`  "Read ${aiDir}/shadow-detection.md and analyze my local components"`));
}
