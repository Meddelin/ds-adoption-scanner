#!/usr/bin/env node
/**
 * Generate V2 report from scan results
 * Usage: node scripts/generate-v2-report.mjs --config ant-design.config.ts
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { loadConfig, runScan, aggregateCrossRepository, writeJSONV2, writeHTMLV2 } = require('../dist/index.cjs');
import fs from 'fs';
import path from 'path';

async function main() {
  const configPath = process.argv.find(arg => arg.includes('.config.ts')) || '.ds-scanner.config.ts';
  
  console.log(`Loading config from ${configPath}...`);
  const config = await loadConfig(configPath);
  
  console.log('Running scan...');
  const startTime = Date.now();
  const v1Report = await runScan(config);
  const scanDurationMs = Date.now() - startTime;
  
  console.log('Processing V2 classification...');
  
  // Process each repository
  const repoMetrics = [];
  const allUsages = new Map();
  const allProfiles = new Map();
  
  for (const repoReport of v1Report.byRepository) {
    const repoPath = repoReport.path;
    
    // Get usages for this repo from the scan
    // Note: This is a simplified version - in real implementation,
    // we'd need to get the raw usages from the orchestrator
    
    // For now, create mock classified usages from V1 report
    const classifiedUsages = [];
    const profiles = [];
    
    // TODO: Get actual usages from scanner
    // This requires modifying the orchestrator to return raw usages
    
    repoMetrics.push({
      name: repoReport.name,
      path: repoPath,
      filesScanned: repoReport.filesScanned,
      directAdoption: {
        percentage: repoReport.adoptionRate,
        instances: repoReport.designSystemTotal.instances,
        components: repoReport.designSystemTotal.uniqueComponents,
        isProxy: false,
        formula: 'Direct DS / Denominator × 100',
        denominator: {
          instances: repoReport.designSystemTotal.instances + repoReport.localLibrary.instances + repoReport.localReusable.instances,
          components: repoReport.designSystemTotal.uniqueComponents + repoReport.localLibrary.uniqueComponents + repoReport.localReusable.uniqueComponents,
          explanation: 'DS + Local Library + Reusable Local',
        },
      },
      effectiveAdoptionProxy: {
        percentage: repoReport.effectiveAdoptionRate,
        instances: repoReport.designSystemTotal.instances + repoReport.localLibrary.instances,
        components: repoReport.designSystemTotal.uniqueComponents + repoReport.localLibrary.uniqueComponents,
        isProxy: true,
        formula: '(Direct DS + Transitive) / Denominator × 100',
        denominator: {
          instances: repoReport.designSystemTotal.instances + repoReport.localLibrary.instances + repoReport.localReusable.instances,
          components: repoReport.designSystemTotal.uniqueComponents + repoReport.localLibrary.uniqueComponents + repoReport.localReusable.uniqueComponents,
          explanation: 'DS + Local Library + Reusable Local',
        },
      },
      shadowUsageProxy: {
        percentage: (repoReport.localReusable.instances / (repoReport.designSystemTotal.instances + repoReport.localLibrary.instances + repoReport.localReusable.instances)) * 100,
        instances: repoReport.localReusable.instances,
        components: repoReport.localReusable.uniqueComponents,
        isProxy: true,
        formula: 'Shadow / Denominator × 100',
        denominator: {
          instances: repoReport.designSystemTotal.instances + repoReport.localLibrary.instances + repoReport.localReusable.instances,
          components: repoReport.designSystemTotal.uniqueComponents + repoReport.localLibrary.uniqueComponents + repoReport.localReusable.uniqueComponents,
          explanation: 'DS + Local Library + Reusable Local',
        },
      },
      bucketBreakdown: {
        adoption: {
          instances: repoReport.designSystemTotal.instances,
          components: repoReport.designSystemTotal.uniqueComponents,
          percentage: (repoReport.designSystemTotal.instances / (repoReport.designSystemTotal.instances + repoReport.localLibrary.instances + repoReport.localReusable.instances)) * 100,
          topComponents: repoReport.designSystems.flatMap(ds => ds.topComponents?.map(c => c.name) || []),
        },
        shadow: {
          instances: repoReport.localReusable.instances,
          components: repoReport.localReusable.uniqueComponents,
          percentage: (repoReport.localReusable.instances / (repoReport.designSystemTotal.instances + repoReport.localLibrary.instances + repoReport.localReusable.instances)) * 100,
          topComponents: v1Report.byComponent.localMostUsed?.map(c => c.name) || [],
        },
        neither: {
          instances: repoReport.localUnique.instances + repoReport.thirdParty.instances + repoReport.htmlNative.instances,
          components: repoReport.localUnique.uniqueComponents + repoReport.thirdParty.uniqueComponents + repoReport.htmlNative.uniqueComponents,
          percentage: ((repoReport.localUnique.instances + repoReport.thirdParty.instances + repoReport.htmlNative.instances) / 
            (repoReport.designSystemTotal.instances + repoReport.localLibrary.instances + repoReport.localReusable.instances + repoReport.localUnique.instances + repoReport.thirdParty.instances + repoReport.htmlNative.instances)) * 100,
          topComponents: [],
        },
      },
      designSystems: repoReport.designSystems.map(ds => ({
        name: ds.name,
        packages: config.designSystems.find(d => d.name === ds.name)?.packages || [],
        directAdoption: {
          percentage: ds.adoptionRate,
          instances: ds.instances,
          components: ds.uniqueComponents,
          isProxy: false,
          formula: `Direct ${ds.name} / Denominator × 100`,
          denominator: {
            instances: repoReport.designSystemTotal.instances + repoReport.localLibrary.instances + repoReport.localReusable.instances,
            components: repoReport.designSystemTotal.uniqueComponents + repoReport.localLibrary.uniqueComponents + repoReport.localReusable.uniqueComponents,
            explanation: 'DS + Local Library + Reusable Local',
          },
        },
        effectiveAdoptionProxy: {
          percentage: ds.effectiveAdoptionRate,
          instances: ds.instances + ds.transitiveInstances,
          components: ds.uniqueComponents,
          isProxy: true,
          formula: `(Direct ${ds.name} + Transitive) / Denominator × 100`,
          denominator: {
            instances: repoReport.designSystemTotal.instances + repoReport.localLibrary.instances + repoReport.localReusable.instances,
            components: repoReport.designSystemTotal.uniqueComponents + repoReport.localLibrary.uniqueComponents + repoReport.localReusable.uniqueComponents,
            explanation: 'DS + Local Library + Reusable Local',
          },
        },
        instances: ds.instances,
        transitiveInstances: ds.transitiveInstances,
        uniqueComponents: ds.uniqueComponents,
        topComponents: ds.topComponents?.map(c => ({ name: c.name, instances: c.instances, filesUsedIn: c.filesUsedIn })) || [],
        totalFamilies: ds.totalFamilies,
        familiesUsed: ds.familiesUsed,
        familyCoverage: ds.familyCoverage,
      })),
      routes: undefined,
    });
    
    allUsages.set(repoReport.name, classifiedUsages);
    allProfiles.set(repoReport.name, profiles);
  }
  
  // Build V2 report
  const v2Report = aggregateCrossRepository(
    repoMetrics,
    allUsages,
    allProfiles,
    config,
    scanDurationMs,
    v1Report.meta.filesScanned
  );
  
  // Override meta with actual data
  v2Report.meta.timestamp = v1Report.meta.timestamp;
  v2Report.meta.configPath = configPath;
  
  // Write reports
  const jsonPath = 'ds-report-v2.json';
  const htmlPath = 'ds-report-v2.html';
  
  writeJSONV2(v2Report, jsonPath);
  console.log(`V2 JSON report: ${jsonPath}`);
  
  writeHTMLV2(v2Report, htmlPath);
  console.log(`V2 HTML report: ${htmlPath}`);
  
  console.log('\nV2 Summary:');
  console.log(`  Direct Adoption: ${v2Report.summary.directAdoption.percentage.toFixed(1)}%`);
  console.log(`  Effective Adoption Proxy: ${v2Report.summary.effectiveAdoptionProxy.percentage.toFixed(1)}%`);
  console.log(`  Shadow Usage Proxy: ${v2Report.summary.shadowUsageProxy.percentage.toFixed(1)}%`);
  console.log(`  Adoption: ${v2Report.summary.bucketBreakdown.adoption.percentage.toFixed(1)}%`);
  console.log(`  Shadow: ${v2Report.summary.bucketBreakdown.shadow.percentage.toFixed(1)}%`);
  console.log(`  Neither: ${v2Report.summary.bucketBreakdown.neither.percentage.toFixed(1)}%`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
