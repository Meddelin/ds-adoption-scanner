import { Command } from 'commander';
import ora from 'ora';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { loadConfig, ConfigError } from './config/loader.js';
import { runScan } from './scanner/orchestrator.js';
import { printReport } from './output/table-reporter.js';
import { formatJSON, writeJSON } from './output/json-reporter.js';
import { formatCSV, writeCSV } from './output/csv-reporter.js';
import { saveHistory, compareReports, loadReport } from './metrics/history.js';
import type { ScanReport } from './types.js';

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
  .option('-f, --format <format>', 'Output format: table | json | csv', 'table')
  .option('-o, --output <path>', 'Save report to file')
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

      // Override format/output from CLI flags
      if (opts.format) config.output.format = opts.format as 'table' | 'json' | 'csv';
      if (opts.output) config.output.path = opts.output;
      if (opts.verbose) config.output.verbose = true;

      const spinner = ora('Discovering files...').start();
      let lastRepo = '';

      const report = await runScan(config, {
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

      // Compare with baseline if requested
      if (opts.compare) {
        try {
          const baseline = loadReport(opts.compare);
          report.comparison = compareReports(baseline, report);
          printComparison(report);
        } catch (err) {
          console.warn(chalk.yellow(`[Warning] Could not load baseline: ${opts.compare}`));
        }
      }

      // Save history if requested
      if (opts.saveHistory) {
        const savedPath = saveHistory(report, config.historyDir);
        console.log(chalk.dim(`  History saved: ${savedPath}`));
      }

      // Output report
      const format = config.output.format;
      const outputPath = config.output.path;

      if (format === 'json') {
        const json = formatJSON(report);
        if (outputPath) {
          writeJSON(report, outputPath);
          console.log(chalk.dim(`  Report saved: ${outputPath}`));
        } else {
          console.log(json);
        }
      } else if (format === 'csv') {
        const csv = formatCSV(report);
        if (outputPath) {
          writeCSV(report, outputPath);
          console.log(chalk.dim(`  Report saved: ${outputPath}`));
        } else {
          console.log(csv);
        }
      } else {
        // table
        printReport(report, config.output.verbose);
        if (outputPath) {
          writeJSON(report, outputPath);
          console.log(chalk.dim(`  JSON report saved: ${outputPath}`));
        }
      }

      // Check adoption thresholds
      const minAdoption = opts.minAdoption
        ? parseFloat(opts.minAdoption)
        : config.thresholds.minAdoptionRate;

      if (minAdoption !== undefined && report.summary.adoptionRate < minAdoption) {
        console.error(
          chalk.red(
            `\n[Threshold] Adoption rate ${report.summary.adoptionRate.toFixed(1)}% is below minimum ${minAdoption}%\n`
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
  .description('Compare two scan JSON reports')
  .action(async (baselinePath: string, currentPath: string) => {
    try {
      const baseline = loadReport(baselinePath);
      const current = loadReport(currentPath);
      current.comparison = compareReports(baseline, current);
      printComparison(current);
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

function printComparison(report: ScanReport): void {
  const cmp = report.comparison;
  if (!cmp) return;

  console.log(chalk.bold('\n  📈 Comparison with baseline'));
  console.log(chalk.dim('  ' + '─'.repeat(65)));

  const arrow = cmp.adoptionDelta >= 0 ? '↑' : '↓';
  const deltaColor = cmp.adoptionDelta >= 0 ? chalk.green : chalk.red;
  console.log(
    `  Adoption delta: ${deltaColor(`${arrow} ${Math.abs(cmp.adoptionDelta).toFixed(1)}%`)}`
  );

  for (const ds of cmp.byDesignSystem) {
    const a = ds.adoptionDelta >= 0 ? '↑' : '↓';
    const c = ds.adoptionDelta >= 0 ? chalk.green : chalk.red;
    console.log(`  ${ds.name}: ${c(`${a} ${Math.abs(ds.adoptionDelta).toFixed(1)}%`)}`);
  }

  if (cmp.newComponents.length > 0) {
    console.log(chalk.dim(`\n  New DS components: ${cmp.newComponents.slice(0, 5).join(', ')}`));
  }
  if (cmp.removedComponents.length > 0) {
    console.log(chalk.dim(`  Removed: ${cmp.removedComponents.slice(0, 5).join(', ')}`));
  }
  console.log();
}

program.parse(process.argv);
