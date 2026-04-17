import { Command } from 'commander';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { loadConfig, ConfigError } from './config/loader.js';
import { runScanV2 } from './scanner/orchestrator-v2.js';
import { printReportV2 } from './output/table-reporter-v2.js';
import { writeJSONV2 } from './output/json-reporter-v2.js';
import { writeHTMLV2 } from './output/html-reporter-v2.js';
import {
  saveHistory,
  compareReports,
  loadReport,
  type V2ReportComparison,
} from './metrics/history.js';
import type { ScanReportV2 } from './domain/types.js';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('ds-scanner')
  .description('DS Adoption Scanner — scan React/TypeScript repos for design system usage')
  .version(VERSION);

// ── analyze ──────────────────────────────────────────────────────────────────

program
  .command('analyze')
  .description('Run a full design system adoption scan')
  .option('-c, --config <path>', 'Path to config file', '.ds-scanner.config.ts')
  .option('-o, --output <path>', 'Base output path (e.g. ./reports/scan → scan.json + scan.html)')
  .option('-v, --verbose', 'Verbose output (show parse warnings)')
  .option('--min-adoption <number>', 'Fail if adoption rate is below this threshold (CI)')
  .option('--compare <path>', 'Compare with a previous scan JSON')
  .option('--save-history', 'Save result to historyDir')
  .action(async (opts) => {
    let exitCode = 0;

    try {
      // Load config
      const { config, configPath } = await loadConfig(opts.config).catch(err => {
        if (err instanceof ConfigError) {
          console.error(chalk.red(`\n[Config Error] ${err.message}\n`));
          process.exit(2);
        }
        throw err;
      });

      // Override output path / verbose from CLI flags
      if (opts.output) config.output.path = opts.output;
      if (opts.verbose) config.output.verbose = true;

      const spinner = ora('Discovering files...').start();
      let lastRepo = '';

      const report = await runScanV2(config, {
        configPath,
        verbose: opts.verbose ?? false,
        onProgress: (current, total, repoName) => {
          if (repoName !== lastRepo) {
            lastRepo = repoName;
            spinner.text = `Scanning ${repoName}... (${current}/${total} files)`;
          } else {
            spinner.text = `Scanning ${repoName}... (${current}/${total} files)`;
          }
        },
      }).catch(err => {
        spinner.fail('Scan failed');
        console.error(chalk.red(`\n[Scan Error] ${err instanceof Error ? err.message : String(err)}\n`));
        process.exit(3);
      });

      spinner.succeed(
        `Scanned ${report.meta.filesScanned} files across ${report.meta.repositoriesScanned} repos in ${(report.meta.scanDurationMs / 1000).toFixed(1)}s`
      );

      if (opts.compare) {
        try {
          const baseline = loadReport(opts.compare);
          const comparison = compareReports(baseline, report);
          printComparisonV2(comparison);
        } catch (err) {
          console.warn(chalk.yellow(`[Warning] Could not load baseline: ${opts.compare}`));
        }
      }

      if (opts.saveHistory) {
        const savedPath = saveHistory(report, config.historyDir);
        console.log(chalk.dim(`  History saved: ${savedPath}`));
      }

      const { jsonPath, htmlPath } = deriveOutputPaths(config.output.path);

      printReportV2(report);

      writeJSONV2(report, jsonPath);
      console.log(chalk.dim(`  JSON report: ${jsonPath}`));

      try {
        writeHTMLV2(report, htmlPath);
        console.log(chalk.dim(`  HTML report: ${htmlPath}`));
      } catch (htmlErr) {
        console.warn(chalk.yellow(`  Warning: could not write HTML report: ${htmlErr instanceof Error ? htmlErr.message : String(htmlErr)}`));
      }

      const minAdoption = opts.minAdoption
        ? parseFloat(opts.minAdoption)
        : config.thresholds.minAdoptionRate;

      if (minAdoption !== undefined && report.summary.directAdoption.percentage < minAdoption) {
        console.error(
          chalk.red(
            `\n[Threshold] Direct adoption ${report.summary.directAdoption.percentage.toFixed(1)}% is below minimum ${minAdoption}%\n`
          )
        );
        exitCode = 1;
      }

    } catch (err) {
      console.error(chalk.red(`\n[Error] ${err instanceof Error ? err.message : String(err)}\n`));
      exitCode = 3;
    }

    process.exit(exitCode);
  });

// ── config ────────────────────────────────────────────────────────────────────

program
  .command('config')
  .description('Show the resolved configuration')
  .option('-c, --path <path>', 'Path to config file', '.ds-scanner.config.ts')
  .action(async (opts) => {
    try {
      const { config, configPath } = await loadConfig(opts.path);
      console.log(chalk.bold(`\nConfig loaded from: ${chalk.cyan(configPath)}\n`));
      console.log(JSON.stringify(config, null, 2));
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error(chalk.red(`\n[Config Error] ${err.message}\n`));
        process.exit(2);
      }
      console.error(chalk.red(`\n[Error] ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(2);
    }
  });

// ── compare ───────────────────────────────────────────────────────────────────

program
  .command('compare <baseline> <current>')
  .description('Compare two v2 scan JSON reports')
  .action(async (baselinePath: string, currentPath: string) => {
    try {
      const baseline = loadReport(baselinePath);
      const current = loadReport(currentPath);
      printComparisonV2(compareReports(baseline, current));
    } catch (err) {
      console.error(chalk.red(`\n[Error] ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  });

// ── init ──────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize a .ds-scanner.config.ts in the current directory')
  .action(async () => {
    const configPath = path.join(process.cwd(), '.ds-scanner.config.ts');

    if (fs.existsSync(configPath)) {
      console.log(chalk.yellow(`Config already exists: ${configPath}`));
      return;
    }

    const template = `import { defineConfig } from 'ds-adoption-scanner';

export default defineConfig({
  repositories: [
    // './path/to/your/repo',
  ],

  designSystems: [
    {
      name: 'MyDS',
      packages: [
        '@myds/components',
        '@myds/icons',
      ],
    },
  ],

  include: ['src/**/*.{ts,tsx,js,jsx}'],

  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
  ],

  localLibraryPatterns: [
    '@shared/components',
    '@shared/components/*',
  ],

  output: {
    format: 'table',
    verbose: false,
  },

  historyDir: './.ds-metrics',
});
`;

    fs.writeFileSync(configPath, template, 'utf-8');
    console.log(chalk.green(`\nCreated: ${configPath}`));
    console.log(chalk.dim('\nEdit the config to add your repositories and design systems.'));
    console.log(chalk.dim('Then run: ds-scanner analyze\n'));
  });

// ─────────────────────────────────────────────────────────────────────────────

function printComparisonV2(cmp: V2ReportComparison): void {
  console.log(chalk.bold('\n  Comparison with baseline (v2)'));
  console.log(chalk.dim('  ' + '-'.repeat(65)));

  const fmtDelta = (delta: number, label: string) => {
    const arrow = delta >= 0 ? '+' : '';
    const color = delta >= 0 ? chalk.green : chalk.red;
    console.log(`  ${label}: ${color(`${arrow}${delta.toFixed(1)}%`)}`);
  };

  fmtDelta(cmp.directAdoptionDelta, 'Direct Adoption');
  fmtDelta(cmp.effectiveAdoptionDelta, 'Effective Adoption (proxy)');
  fmtDelta(cmp.shadowUsageDelta, 'Shadow Usage (proxy)');

  if (cmp.byDesignSystem.length > 0) {
    console.log(chalk.dim('\n  Per design system:'));
    for (const ds of cmp.byDesignSystem) {
      fmtDelta(ds.directAdoptionDelta, `  ${ds.name}`);
    }
  }

  if (cmp.newAdoptionComponents.length > 0) {
    console.log(
      chalk.dim(`\n  New adoption components: ${cmp.newAdoptionComponents.slice(0, 5).join(', ')}`)
    );
  }
  if (cmp.newShadowComponents.length > 0) {
    console.log(
      chalk.dim(`  New shadow candidates:   ${cmp.newShadowComponents.slice(0, 5).join(', ')}`)
    );
  }
  console.log();
}

function deriveOutputPaths(base: string | undefined): { jsonPath: string; htmlPath: string } {
  if (!base) {
    return { jsonPath: 'ds-report-v2.json', htmlPath: 'ds-report-v2.html' };
  }
  const noExt = base.replace(/\.(json|html|csv)$/i, '');
  return { jsonPath: noExt + '.json', htmlPath: noExt + '.html' };
}

program.parse(process.argv);
