#!/usr/bin/env node
/**
 * Generate a real V2 report from scanner raw usages.
 * Usage: node scripts/generate-v2-report.mjs --config ant-design.config.ts
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  loadConfig,
  runScanDetailed,
  aggregateCrossRepository,
  writeJSONV2,
  writeHTMLV2,
  AnalyticalClassifier,
  createClassificationContext,
  RouteResolutionOrchestrator,
  createDefaultRouteConfig,
  calculateRepositoryMetricsV2,
  calculateRouteMetrics,
} = require('../dist/index.cjs');

function parseConfigArg(argv) {
  const idx = argv.findIndex(arg => arg === '--config' || arg === '-c');
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1];
  }

  return argv.find(arg => arg.endsWith('.config.ts')) ?? '.ds-scanner.config.ts';
}

async function resolveRoutes(repoPath, usages) {
  const filePaths = [...new Set(usages.map(u => u.filePath))];
  const routeMapping = new Map();
  const routeConfidenceByFile = new Map();

  if (filePaths.length === 0) {
    return { routeMapping, routeConfidenceByFile };
  }

  const routeResolver = new RouteResolutionOrchestrator(createDefaultRouteConfig());
  const initialized = await routeResolver.initialize(repoPath);
  if (!initialized) {
    return { routeMapping, routeConfidenceByFile };
  }

  const routeResults = await routeResolver.resolveFiles(filePaths);
  for (const result of routeResults) {
    if (!result.routeMatch) continue;
    routeMapping.set(result.filePath, result.routeMatch.routeId);
    routeConfidenceByFile.set(result.filePath, result.routeMatch.confidence);
  }

  return { routeMapping, routeConfidenceByFile };
}

async function main() {
  const configPathArg = parseConfigArg(process.argv.slice(2));

  console.log(`Loading config from ${configPathArg}...`);
  const { config, configPath } = await loadConfig(configPathArg);

  const startedAt = Date.now();

  console.log('Running base scan (V1 pipeline)...');
  const { report: v1Report, repoData } = await runScanDetailed(config, {
    configPath,
    verbose: false,
  });

  console.log('Building deterministic V2 classification and route metrics...');

  const repoMetrics = [];
  const allUsages = new Map();
  const allProfiles = new Map();

  for (const repo of repoData) {
    const { routeMapping, routeConfidenceByFile } = await resolveRoutes(
      repo.repositoryPath,
      repo.usages
    );

    const classifier = new AnalyticalClassifier(
      createClassificationContext(
        repo.repositoryPath,
        config.designSystems.map(ds => ({ name: ds.name, packages: ds.packages })),
        { routeMapping }
      )
    );

    const classification = classifier.classify(repo.usages);

    const classifiedWithRoutes = classification.usages.map(usage => {
      const routeId = routeMapping.get(usage.filePath);
      if (!routeId) {
        return usage;
      }

      return {
        ...usage,
        routeId,
        routeConfidence: routeConfidenceByFile.get(usage.filePath) ?? 'low',
      };
    });

    const routeMetrics =
      routeMapping.size > 0
        ? calculateRouteMetrics(classifiedWithRoutes, routeMapping)
        : undefined;

    const repoMetric = calculateRepositoryMetricsV2(
      repo.repositoryName,
      repo.repositoryPath,
      classifiedWithRoutes,
      classification.profiles,
      config,
      repo.filesScanned,
      routeMetrics
    );

    repoMetrics.push(repoMetric);
    allUsages.set(repo.repositoryPath, classifiedWithRoutes);
    allProfiles.set(repo.repositoryPath, classification.profiles);
  }

  const scanDurationMs = Date.now() - startedAt;

  const v2Report = aggregateCrossRepository(
    repoMetrics,
    allUsages,
    allProfiles,
    config,
    scanDurationMs,
    v1Report.meta.filesScanned
  );

  v2Report.meta.timestamp = v1Report.meta.timestamp;
  v2Report.meta.configPath = configPath;

  const jsonPath = 'ds-report-v2.json';
  const htmlPath = 'ds-report-v2.html';

  writeJSONV2(v2Report, jsonPath);
  console.log(`V2 JSON report: ${jsonPath}`);

  writeHTMLV2(v2Report, htmlPath);
  console.log(`V2 HTML report: ${htmlPath}`);

  console.log('\nV2 Summary:');
  console.log(`  Direct Adoption: ${v2Report.summary.directAdoption.percentage.toFixed(1)}%`);
  console.log(
    `  Effective Adoption Proxy: ${v2Report.summary.effectiveAdoptionProxy.percentage.toFixed(1)}%`
  );
  console.log(`  Shadow Usage Proxy: ${v2Report.summary.shadowUsageProxy.percentage.toFixed(1)}%`);
  console.log(`  Adoption: ${v2Report.summary.bucketBreakdown.adoption.percentage.toFixed(1)}%`);
  console.log(`  Shadow: ${v2Report.summary.bucketBreakdown.shadow.percentage.toFixed(1)}%`);
  console.log(`  Neither: ${v2Report.summary.bucketBreakdown.neither.percentage.toFixed(1)}%`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
