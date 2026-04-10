# Changelog

## v2.1.0 — React Router, Resolver Filters, Effective Adoption Everywhere, Bar Removal

### Added

- **React Router Resolver**: New `react-router-resolver.ts` detects routes from React Router v6
  `createBrowserRouter` / `createHashRouter` / `<Routes>` config in `App.tsx` / `router.ts`
  and similar entry points.

- **Route Source Tracking**: `RouteMatch.source` field now propagates from resolver through
  `RouteAttribution.sourceByRouteId` → `RouteMetrics.resolver`. Each route now knows which
  resolver (react-router, nextjs-pages, nextjs-app, path-pattern, fallback-directory) found it.

- **Resolver Filter in HTML Report**: "Router" pill group (React Router / Next.js / Other)
  appears dynamically in the Routes tab only when those resolvers are present in scan data.
  Resolver tag (colored badge) shown inline with each route row.

- **Effective Adoption in All Tables**: `effectiveAdoptionProxy.percentage` now appears in:
  - Routes tab table (new "Effective" column)
  - Per-repo route tables in Repos tab
  - Heatmap cells (shows `eff X%` in DS blue when effective differs from direct by ≥ 0.5pp)

- **Transitive Barrel Re-export Following**: `transitive-resolver.ts` now parses
  `ExportNamedDeclaration` / `ExportAllDeclaration` in barrel files (index.ts) and recursively
  checks re-exported source files for DS imports. Fixes the common `src/ui-kit/index.ts` pattern.

### Changed

- **No More Bar Visualizations**: Removed all stacked-bar and sparkline widgets from HTML report.
  Numbers only — adoption percentages displayed as colored text without bar charts.
  Removed CSS classes: `.bbar`, `.bleg`, `.bbar .seg`, `.bar-wrap`, `.bar`, `.bval`, `.rbar-area`.

- **Repos Overview Table**: Removed "Buckets" column with mini stacked bar.

- **Invariant Fix — `no-double-counting`**: The invariant now correctly compares
  `adoption + shadow` (i.e. the metric denominator) vs `denominator.instances`.
  Previously it included `neither`, which always caused a false failure when any
  usage was classified to the `neither` bucket.

### Fixed

- **Classifier second-pass override**: Local-library usages already classified to `adoption`
  via transitive detection (source `transitive-declared` or `transitive-auto`) are now skipped
  in the second classifier pass, preventing shadow signals from overwriting their bucket.

- **Test `calculator-v2.test.ts`**: Updated expected route metric from 50% → 100% to match
  the corrected denominator (neither excluded; adoption=1, shadow=0, denominator=1).

---

## v2.0.0 — Deterministic Analytical Model (Breaking)

### Added

- **Analytical Buckets**: New mutually exclusive classification system:
  - `adoption` — confirmed DS usage (direct + transitive)
  - `shadow` — parallel local UI layer (deterministic signals)
  - `neither` — utility/business wrappers (excluded from metrics)

- **Route-Level Metrics**: New aggregation level with framework-aware route resolution:
  - Next.js pages/ and app/ directory support
  - Fallback directory-based resolution
  - Confidence markers for all route mappings

- **Shadow Usage Proxy**: Deterministic detection of parallel UI layer:
  - Reusable local component detection
  - Multi-route usage signals
  - UI family pattern detection
  - Substantial markup heuristics
  - NO AI, NO embeddings — purely rule-based

- **V2 Report Schema** (`ScanReportV2`):
  - Explicit proxy metric marking (`isProxy: true`)
  - Transparent formulas for all metrics
  - Bucket breakdown with percentages
  - Route coverage summary
  - Classification configuration transparency

- **New Domain Layer** (`src/domain/`):
  - Core types for analytical model
  - Invariant checks (bucket exclusivity, no double counting)
  - Constants and thresholds

- **Route Resolution Layer** (`src/routes/`):
  - Extensible resolver interface
  - Next.js resolver
  - Fallback resolver

- **Classification Layer** (`src/classification/`):
  - Analytical classifier
  - Shadow signal detectors
  - Neither heuristics

- **V2 Metrics** (`src/metrics/calculator-v2.ts`, `src/metrics/aggregator-v2.ts`):
  - Correct transitive coverage weighting (bug fix)
  - Route-level metric calculation
  - Cross-repository aggregation

### Changed

- **Metric Naming**: `effectiveAdoptionRate` → `effectiveAdoptionProxyRate` (explicit proxy)
- **Transitive Coverage Fix**: `transitiveDS.coverage` now properly used in weighted calculations
- **Denominator Definition**: Now explicitly `Adoption + Shadow + Neither` (excluding HTML native)

### Migration Guide

- Existing V1 API continues to work
- New V2 API available through `/domain`, `/routes`, `/classification` modules
- Report schema version bumped to `2.0`

---

## v0.5.19 — Transitive counting fix, component-name family fallback, libraryPackage attribution

### Changed

- **`libraryPackage` field in `transitiveDS`**: при детектировании через реестр библиотек (Case 0)
  в аннотацию `transitiveDS` теперь записывается `libraryPackage` — ключ библиотеки из `libraries[]`.
  Это позволяет оркестратору точно атрибутировать usages к нужной библиотеке вместо парсинга import source.

- **Counting fix in orchestrator**: `transitivePerPkg` теперь использует `u.transitiveDS.libraryPackage`
  как первичный ключ при подсчёте usages по библиотеке. Ранее парсинг `importEntry.source` давал
  `".."` для relative-path импортов (path alias → `isNodeModule=false`), что ломало агрегацию.
  Результат: колонка `Transitive Usages` в таблице Transitive Dependency Chains теперь совпадает
  с `Transitive Instances` в Category Breakdown.

- **Family fallback B (component-name prefix matching)**: когда path-based family fallback не работает
  (libBase из git-кеша vs resolvedPath из node_modules — разные деревья директорий),
  теперь применяется fallback по имени компонента.
  Ключ family map (kebab-case, e.g. `"empty-state"`) конвертируется в CamelCase-префикс (`"EmptyState"`)
  и проверяется через `componentName.startsWith(prefix)`. Благодаря этому `EmptyStateNoData`,
  `EmptyStateError` и т.д. правильно определяются как DS-backed.

- **Тип `CategorizedUsage.transitiveDS`**: добавлено опциональное поле `libraryPackage?: string`.

---

## v0.5.18 — Correct effective denominator, default excludeUniqueLocal=true, family DS-backing propagation

### Changed

- **Effective adoption denominator fix**: `effectiveDenominator` теперь равен `denominator` (так же, как у direct adoption).
  Ранее к знаменателю ошибочно прибавлялся `transitiveLocalLib`, хотя он уже входит в `L ⊂ denominator`.
  Формула: `effectiveAdoptionRate = (DS + transitiveLocalLib) / denominator × 100`.

- **Default `excludeUniqueLocalFromAdoption: true`**: уникальные local-компоненты (используемые только в 1 файле)
  по умолчанию исключены из знаменателя. Поведение можно переопределить в конфиге.

- **Family-level DS-backing propagation (library prescan)**:
  - Добавлено поле `libBase` в `LibraryRegistry` для вычисления family-сегмента по resolvedPath.
  - Если компонент не найден в `componentMap`, но его `resolvedPath` попадает в DS-backed family
    (по `familyMap`), он теперь тоже помечается как `transitiveDS`.
  - Для auto-detect (`transitiveAdoption.enabled`): после основного прохода все local-library usages
    в той же директории, что и уже аннотированный usage, также получают `transitiveDS` (propagation по семье).

### Docs

- Обновлены формулы в `docs/PRODUCT_ANALYST_VALIDATION_GUIDE.md`.
- Обновлена формула effective adoption в `README.md`.
