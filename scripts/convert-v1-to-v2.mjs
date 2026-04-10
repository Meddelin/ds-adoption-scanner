#!/usr/bin/env node
/**
 * Convert V1 report to V2 format
 * Usage: node scripts/convert-v1-to-v2.mjs
 */

import fs from 'fs';

// Read V1 report
const v1Report = JSON.parse(fs.readFileSync('ds-report.json', 'utf-8'));

// Transform to V2
const v2Report = {
  version: '2.0',
  meta: {
    scannerVersion: '2.0.0',
    timestamp: v1Report.meta.timestamp,
    scanDurationMs: v1Report.meta.scanDurationMs,
    configPath: v1Report.meta.configPath,
    filesScanned: v1Report.meta.filesScanned,
    repositoriesScanned: v1Report.meta.repositoriesScanned,
    designSystemsConfigured: v1Report.meta.designSystemsConfigured,
    routeResolutionEnabled: false,
    shadowDetectionEnabled: true,
    thresholds: {
      reusableFileThreshold: v1Report.meta.reusableThreshold,
      shadowFileThreshold: 2,
      shadowRouteThreshold: 2,
      substantialMarkupThreshold: 5,
    },
  },
  summary: {
    directAdoption: {
      percentage: v1Report.summary.adoptionRate,
      instances: v1Report.summary.designSystemTotal.instances,
      components: v1Report.summary.designSystemTotal.uniqueComponents,
      isProxy: false,
      formula: 'Direct DS / (Adoption + Shadow + Neither) × 100',
      denominator: {
        instances: v1Report.summary.totalComponentInstances,
        components: v1Report.summary.designSystemTotal.uniqueComponents + 
                    v1Report.summary.localLibrary.uniqueComponents + 
                    v1Report.summary.localReusable.uniqueComponents,
        explanation: 'DS + Local Library + Reusable Local (excluding HTML native and third-party)',
      },
    },
    effectiveAdoptionProxy: {
      percentage: v1Report.summary.effectiveAdoptionRate,
      instances: v1Report.summary.designSystemTotal.instances + v1Report.summary.transitiveDS.totalInstances,
      components: v1Report.summary.designSystemTotal.uniqueComponents + v1Report.summary.localLibrary.uniqueComponents,
      isProxy: true,
      formula: '(Direct DS + Weighted Transitive) / Denominator × 100',
      denominator: {
        instances: v1Report.summary.totalComponentInstances,
        components: v1Report.summary.designSystemTotal.uniqueComponents + 
                    v1Report.summary.localLibrary.uniqueComponents + 
                    v1Report.summary.localReusable.uniqueComponents,
        explanation: 'DS + Local Library + Reusable Local (excluding HTML native and third-party)',
      },
    },
    shadowUsageProxy: {
      percentage: (v1Report.summary.localReusable.instances / v1Report.summary.totalComponentInstances) * 100,
      instances: v1Report.summary.localReusable.instances,
      components: v1Report.summary.localReusable.uniqueComponents,
      isProxy: true,
      formula: 'Shadow / Denominator × 100',
      denominator: {
        instances: v1Report.summary.totalComponentInstances,
        components: v1Report.summary.designSystemTotal.uniqueComponents + 
                    v1Report.summary.localLibrary.uniqueComponents + 
                    v1Report.summary.localReusable.uniqueComponents,
        explanation: 'DS + Local Library + Reusable Local (excluding HTML native and third-party)',
      },
    },
    bucketBreakdown: {
      adoption: {
        instances: v1Report.summary.designSystemTotal.instances,
        components: v1Report.summary.designSystemTotal.uniqueComponents,
        percentage: (v1Report.summary.designSystemTotal.instances / v1Report.summary.totalComponentInstances) * 100,
        topComponents: v1Report.summary.designSystems.flatMap(ds => 
          ds.topComponents?.map(c => c.name) || []
        ).slice(0, 10),
      },
      shadow: {
        instances: v1Report.summary.localReusable.instances,
        components: v1Report.summary.localReusable.uniqueComponents,
        percentage: (v1Report.summary.localReusable.instances / v1Report.summary.totalComponentInstances) * 100,
        topComponents: v1Report.byComponent.localMostUsed?.map(c => c.name).slice(0, 10) || [],
      },
      neither: {
        instances: v1Report.summary.localUnique.instances + 
                   v1Report.summary.thirdParty.instances + 
                   v1Report.summary.htmlNative.instances,
        components: v1Report.summary.localUnique.uniqueComponents + 
                    v1Report.summary.thirdParty.uniqueComponents + 
                    v1Report.summary.htmlNative.uniqueComponents,
        percentage: ((v1Report.summary.localUnique.instances + 
                     v1Report.summary.thirdParty.instances + 
                     v1Report.summary.htmlNative.instances) / 
                     (v1Report.summary.totalComponentInstances + 
                      v1Report.summary.localUnique.instances + 
                      v1Report.summary.thirdParty.instances + 
                      v1Report.summary.htmlNative.instances)) * 100,
        topComponents: [],
      },
    },
    routeCoverage: {
      totalFiles: v1Report.meta.filesScanned,
      mappedFiles: 0,
      unmappedFiles: v1Report.meta.filesScanned,
      coveragePercentage: 0,
      byConfidence: { high: 0, medium: 0, low: 0 },
      warnings: ['Route resolution not enabled for this scan'],
    },
  },
  byDesignSystem: v1Report.summary.designSystems.map(ds => ({
    name: ds.name,
    packages: v1Report.meta.designSystemsConfigured.includes(ds.name) ? 
      [`@${ds.name.toLowerCase()}/components`] : [],
    directAdoption: {
      percentage: ds.adoptionRate,
      instances: ds.instances,
      components: ds.uniqueComponents,
      isProxy: false,
      formula: `Direct ${ds.name} / Denominator × 100`,
      denominator: {
        instances: v1Report.summary.totalComponentInstances,
        components: v1Report.summary.designSystemTotal.uniqueComponents + 
                    v1Report.summary.localLibrary.uniqueComponents + 
                    v1Report.summary.localReusable.uniqueComponents,
        explanation: 'DS + Local Library + Reusable Local',
      },
    },
    effectiveAdoptionProxy: {
      percentage: ds.effectiveAdoptionRate,
      instances: ds.instances + ds.transitiveInstances,
      components: ds.uniqueComponents,
      isProxy: true,
      formula: `(Direct ${ds.name} + Weighted Transitive) / Denominator × 100`,
      denominator: {
        instances: v1Report.summary.totalComponentInstances,
        components: v1Report.summary.designSystemTotal.uniqueComponents + 
                    v1Report.summary.localLibrary.uniqueComponents + 
                    v1Report.summary.localReusable.uniqueComponents,
        explanation: 'DS + Local Library + Reusable Local',
      },
    },
    instances: ds.instances,
    transitiveInstances: ds.transitiveInstances,
    uniqueComponents: ds.uniqueComponents,
    topComponents: ds.topComponents?.map(c => ({
      name: c.name,
      instances: c.instances,
      filesUsedIn: c.filesUsedIn,
    })) || [],
    totalFamilies: ds.totalFamilies,
    familiesUsed: ds.familiesUsed,
    familyCoverage: ds.familyCoverage,
  })),
  byRepository: v1Report.byRepository.map(repo => ({
    name: repo.name,
    path: repo.path,
    filesScanned: repo.filesScanned,
    directAdoption: {
      percentage: repo.adoptionRate,
      instances: repo.designSystemTotal.instances,
      components: repo.designSystemTotal.uniqueComponents,
      isProxy: false,
      formula: 'Direct DS / Denominator × 100',
      denominator: {
        instances: repo.designSystemTotal.instances + repo.localLibrary.instances + repo.localReusable.instances,
        components: repo.designSystemTotal.uniqueComponents + repo.localLibrary.uniqueComponents + repo.localReusable.uniqueComponents,
        explanation: 'DS + Local Library + Reusable Local',
      },
    },
    effectiveAdoptionProxy: {
      percentage: repo.effectiveAdoptionRate,
      instances: repo.designSystemTotal.instances + repo.localLibrary.instances,
      components: repo.designSystemTotal.uniqueComponents + repo.localLibrary.uniqueComponents,
      isProxy: true,
      formula: '(Direct DS + Transitive) / Denominator × 100',
      denominator: {
        instances: repo.designSystemTotal.instances + repo.localLibrary.instances + repo.localReusable.instances,
        components: repo.designSystemTotal.uniqueComponents + repo.localLibrary.uniqueComponents + repo.localReusable.uniqueComponents,
        explanation: 'DS + Local Library + Reusable Local',
      },
    },
    shadowUsageProxy: {
      percentage: (repo.localReusable.instances / (repo.designSystemTotal.instances + repo.localLibrary.instances + repo.localReusable.instances)) * 100,
      instances: repo.localReusable.instances,
      components: repo.localReusable.uniqueComponents,
      isProxy: true,
      formula: 'Shadow / Denominator × 100',
      denominator: {
        instances: repo.designSystemTotal.instances + repo.localLibrary.instances + repo.localReusable.instances,
        components: repo.designSystemTotal.uniqueComponents + repo.localLibrary.uniqueComponents + repo.localReusable.uniqueComponents,
        explanation: 'DS + Local Library + Reusable Local',
      },
    },
    bucketBreakdown: {
      adoption: {
        instances: repo.designSystemTotal.instances,
        components: repo.designSystemTotal.uniqueComponents,
        percentage: (repo.designSystemTotal.instances / (repo.designSystemTotal.instances + repo.localLibrary.instances + repo.localReusable.instances)) * 100,
        topComponents: repo.designSystems.flatMap(ds => ds.topComponents?.map(c => c.name) || []).slice(0, 10),
      },
      shadow: {
        instances: repo.localReusable.instances,
        components: repo.localReusable.uniqueComponents,
        percentage: (repo.localReusable.instances / (repo.designSystemTotal.instances + repo.localLibrary.instances + repo.localReusable.instances)) * 100,
        topComponents: [],
      },
      neither: {
        instances: repo.localUnique.instances + repo.thirdParty.instances + repo.htmlNative.instances,
        components: repo.localUnique.uniqueComponents + repo.thirdParty.uniqueComponents + repo.htmlNative.uniqueComponents,
        percentage: ((repo.localUnique.instances + repo.thirdParty.instances + repo.htmlNative.instances) / 
          (repo.designSystemTotal.instances + repo.localLibrary.instances + repo.localReusable.instances + repo.localUnique.instances + repo.thirdParty.instances + repo.htmlNative.instances)) * 100,
        topComponents: [],
      },
    },
    designSystems: repo.designSystems.map(ds => ({
      name: ds.name,
      packages: [],
      directAdoption: {
        percentage: ds.adoptionRate,
        instances: ds.instances,
        components: ds.uniqueComponents,
        isProxy: false,
        formula: `Direct ${ds.name} / Denominator × 100`,
        denominator: {
          instances: repo.designSystemTotal.instances + repo.localLibrary.instances + repo.localReusable.instances,
          components: repo.designSystemTotal.uniqueComponents + repo.localLibrary.uniqueComponents + repo.localReusable.uniqueComponents,
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
          instances: repo.designSystemTotal.instances + repo.localLibrary.instances + repo.localReusable.instances,
          components: repo.designSystemTotal.uniqueComponents + repo.localLibrary.uniqueComponents + repo.localReusable.uniqueComponents,
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
  })),
  byComponent: {
    adoption: v1Report.byComponent.designSystems?.flatMap(ds => 
      ds.components?.map(c => ({
        dsName: ds.name,
        componentName: c.name,
        instances: c.instances,
        filesUsedIn: c.filesUsedIn,
      })) || []
    ) || [],
    shadow: [],
    neither: [],
  },
  localComponentProfiles: [],
  classificationConfig: {
    shadowSignalsEnabled: ['reusable-local', 'multi-route', 'ui-family', 'substantial-markup', 'parallel-layer', 'primitive-like'],
    neitherHeuristicsEnabled: ['utility-pattern', 'data-component', 'layout-wrapper', 'thin-wrapper', 'business-logic'],
    transitiveRulesApplied: [],
  },
};

// Write V2 report
fs.writeFileSync('ds-report-v2.json', JSON.stringify(v2Report, null, 2));
console.log('V2 JSON report: ds-report-v2.json');

// Generate HTML using the built-in function
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { buildHTMLV2 } = require('../dist/index.cjs');

const html = buildHTMLV2(v2Report);
fs.writeFileSync('ds-report-v2.html', html);
console.log('V2 HTML report: ds-report-v2.html');

console.log('\nV2 Summary:');
console.log(`  Direct Adoption: ${v2Report.summary.directAdoption.percentage.toFixed(1)}%`);
console.log(`  Effective Adoption Proxy: ${v2Report.summary.effectiveAdoptionProxy.percentage.toFixed(1)}%`);
console.log(`  Shadow Usage Proxy: ${v2Report.summary.shadowUsageProxy.percentage.toFixed(1)}%`);
console.log(`  Adoption: ${v2Report.summary.bucketBreakdown.adoption.percentage.toFixed(1)}%`);
console.log(`  Shadow: ${v2Report.summary.bucketBreakdown.shadow.percentage.toFixed(1)}%`);
console.log(`  Neither: ${v2Report.summary.bucketBreakdown.neither.percentage.toFixed(1)}%`);
