import chalk from 'chalk';
import Table from 'cli-table3';
import type { ScanReportV2 } from '../domain/types.js';

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function metricColor(value: number): string {
  if (value >= 70) return chalk.green(pct(value));
  if (value >= 40) return chalk.yellow(pct(value));
  return chalk.red(pct(value));
}

function shadowColor(value: number): string {
  if (value >= 30) return chalk.red(pct(value));
  if (value >= 15) return chalk.yellow(pct(value));
  return chalk.green(pct(value));
}

export function printReportV2(report: ScanReportV2): void {
  const title = `DS Adoption Report v2 · ${new Date(report.meta.timestamp).toISOString().slice(0, 10)}`;
  console.log(`\n${chalk.bold.cyan(title)}`);
  console.log(chalk.dim('─'.repeat(title.length)));

  console.log(
    `  ${chalk.bold('Direct Adoption:')} ${metricColor(report.summary.directAdoption.percentage)} (${report.summary.directAdoption.isProxy ? 'proxy' : 'exact'})`
  );
  console.log(
    `  ${chalk.bold('Effective Adoption Proxy:')} ${metricColor(report.summary.effectiveAdoptionProxy.percentage)}`
  );
  console.log(
    `  ${chalk.bold('Shadow Usage Proxy:')} ${shadowColor(report.summary.shadowUsageProxy.percentage)}`
  );

  const bucketTable = new Table({
    head: ['Bucket', 'Instances', 'Components', 'Share'],
    style: { head: [], border: [], compact: true },
    chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
  });

  bucketTable.push(
    ['Adoption', report.summary.bucketBreakdown.adoption.instances, report.summary.bucketBreakdown.adoption.components, pct(report.summary.bucketBreakdown.adoption.percentage)],
    ['Shadow', report.summary.bucketBreakdown.shadow.instances, report.summary.bucketBreakdown.shadow.components, pct(report.summary.bucketBreakdown.shadow.percentage)],
    ['Neither', report.summary.bucketBreakdown.neither.instances, report.summary.bucketBreakdown.neither.components, pct(report.summary.bucketBreakdown.neither.percentage)]
  );

  console.log(`\n${chalk.bold('  Bucket Breakdown')}`);
  console.log(bucketTable.toString());

  if (report.byDesignSystem.length > 0) {
    const dsTable = new Table({
      head: ['Design System', 'Direct', 'Effective', 'Direct Inst.', 'Transitive'],
      style: { head: [], border: [], compact: true },
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    });

    for (const ds of report.byDesignSystem) {
      dsTable.push([
        ds.name,
        metricColor(ds.directAdoption.percentage),
        metricColor(ds.effectiveAdoptionProxy.percentage),
        ds.directAdoption.instances,
        ds.transitiveInstances.toFixed(1),
      ]);
    }

    console.log(`\n${chalk.bold('  Per Design System')}`);
    console.log(dsTable.toString());
  }

  if (report.byRoute && report.byRoute.length > 0) {
    const routeTable = new Table({
      head: ['Route', 'Confidence', 'Direct', 'Effective', 'Shadow'],
      style: { head: [], border: [], compact: true },
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    });

    for (const route of report.byRoute.slice(0, 10)) {
      routeTable.push([
        route.routeId,
        route.confidence,
        metricColor(route.directAdoption.percentage),
        metricColor(route.effectiveAdoptionProxy.percentage),
        shadowColor(route.shadowUsageProxy.percentage),
      ]);
    }

    console.log(`\n${chalk.bold('  Top Routes')}`);
    console.log(routeTable.toString());
  }

  if (report.invariants) {
    const failed = report.invariants.checks.filter(c => !c.passed);
    if (failed.length > 0) {
      console.log(
        `\n${chalk.yellow(`  Invariants: ${failed.length} failed (${failed.map(c => c.name).join(', ')})`)}`
      );
    } else {
      console.log(`\n${chalk.green('  Invariants: all passed')}`);
    }
  }

  console.log(
    chalk.dim(
      `\n  Scanned ${report.meta.filesScanned.toLocaleString('en-US')} files in ${(report.meta.scanDurationMs / 1000).toFixed(1)}s\n`
    )
  );
}
