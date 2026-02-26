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

  // ── Header ──────────────────────────────────────────────────────────────────
  const date = new Date(meta.timestamp).toISOString().slice(0, 10);
  const title = `DS Adoption Report · ${date} · ${meta.repositoriesScanned} repo${meta.repositoriesScanned !== 1 ? 's' : ''}`;
  console.log('\n' + chalk.bold.cyan('╔' + '═'.repeat(title.length + 4) + '╗'));
  console.log(chalk.bold.cyan('║  ') + chalk.bold.white(title) + chalk.bold.cyan('  ║'));
  console.log(chalk.bold.cyan('╚' + '═'.repeat(title.length + 4) + '╝') + '\n');

  // ── Total Adoption ───────────────────────────────────────────────────────────
  console.log(
    `  ${chalk.bold('📊 Total DS Adoption:')}  ` +
    adoptionColor(summary.adoptionRate) +
    `  ${progressBar(summary.adoptionRate)}\n`
  );

  // ── Per Design System ────────────────────────────────────────────────────────
  if (summary.designSystems.length > 0) {
    console.log(chalk.bold('  📐 Per Design System'));
    console.log(chalk.dim('  ' + '─'.repeat(65)));

    const dsTable = new Table({
      head: [
        chalk.bold('DS Name'),
        chalk.bold('Adoption'),
        chalk.bold('Instances'),
        chalk.bold('Unique'),
        chalk.bold('Files w/ DS'),
      ],
      colWidths: [20, 12, 12, 10, 14],
      style: { head: [], border: [], compact: true },
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    });

    for (const ds of summary.designSystems) {
      dsTable.push([
        chalk.cyan(ds.name),
        adoptionColor(ds.adoptionRate),
        formatNum(ds.instances),
        String(ds.uniqueComponents),
        formatPct(ds.filePenetration),
      ]);
    }

    dsTable.push([
      chalk.bold('All DS total'),
      chalk.bold(adoptionColor(summary.adoptionRate)),
      chalk.bold(formatNum(summary.designSystemTotal.instances)),
      chalk.bold(String(summary.designSystemTotal.uniqueComponents)),
      chalk.bold(formatPct(summary.filePenetration)),
    ]);

    console.log(dsTable.toString());
    console.log();
  }

  // ── Category Breakdown ───────────────────────────────────────────────────────
  console.log(chalk.bold('  📦 Category Breakdown'));
  console.log(chalk.dim('  ' + '─'.repeat(65)));

  const denominator =
    summary.designSystemTotal.instances +
    summary.localLibrary.instances +
    summary.local.instances;

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
    chalk.dim(sharePct(summary.local.instances)),
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
        chalk.dim(formatPct(localShare)),
      ]);
    }

    console.log(repoTable.toString());
    console.log();
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
        const bar = progressBar(Math.min(100, (comp.instances / (ds.components[0]?.instances ?? 1)) * 100), 15);
        console.log(
          `    ${chalk.white(comp.name.padEnd(28))} ` +
          `${formatNum(comp.instances).padStart(6)} instances   ` +
          `${String(comp.filesUsedIn).padStart(4)} files`
        );
      }
      console.log();
    }
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
