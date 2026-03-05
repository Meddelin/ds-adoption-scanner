# Changelog

## v0.5.8 — Fix: effective adoption now reflects family-level DS-backing

### Fix: Pass 4 propagates DS-backing from family to all sibling components

In a DS-backed family, only components whose source file directly imports from a DS
package were marked `isDSBacked = true`. Sibling/helper components that import from
each other (e.g., `ConfirmModalHeader` importing `ConfirmModal`) stayed `isDSBacked = false`,
so their usages never counted toward effective adoption.

**Pass 4** (after familyMap is complete): for every component in a DS-backed family,
set `isDSBacked = true` in `componentMap`. This means all instances of all components
in a DS-backed family count as transitive DS coverage (`coverage: 1.0`).

Also, Step 1 of Pass 3 now reads `hasDSImport` from all parsed files (not just those
with PascalCase exports), so hook/util directories that use DS are correctly marked
as DS-backed families.

### Changes
- `src/scanner/library-prescan.ts` — Pass 3 Step 1 uses `for ([filePath, fileInfo] of allInfo)`
  to set `isDSBacked` from any file's DS import; Pass 4 propagates family backing to components
- `tests/unit/library-prescan.test.ts` — test: `ConfirmModalHeader` in DS-backed family
  gets `isDSBacked = true` via propagation; `PlainModal` in non-backed family stays `false`

---

## v0.5.7 — Fix: family count includes hook/util/i18n directories

### Fix: directories without PascalCase exports now counted as families

Pass 3 previously only counted directories that had PascalCase component exports
(`componentToFile`). Directories containing only hooks (`use-prompt-location-change`),
utility functions (`utils`), or i18n strings (`locale`) were silently excluded.

**Two-step Pass 3:**
1. **Discovery** — iterate all parsed files (`allInfo.keys()`) to register every
   feature-area directory as a family, regardless of whether it has component exports.
   Already-excluded paths (`__tests__`, `__stories__`, `dist`) are absent from `allInfo`.
2. **Enrichment** — iterate `componentToFile` to overlay `isDSBacked`/`dsFamily` onto
   the already-discovered family entries.

### Changes
- `src/scanner/library-prescan.ts` — Pass 3 uses two-step approach; extracted
  `getFamilyDirName()` (returns `null` for root/all-generic paths); `getLocalFamilyName`
  now delegates to `getFamilyDirName` with `componentName` fallback

---

## v0.5.6 — Fix: familyMap built from componentToFile, not componentMap

### Fix: Pass 3 now mirrors DS prescan — iterate componentToFile only

`buildComponentMap` Pass 3 was iterating `componentMap` (populated from the full
`resolveFileExports` chain). Any component resolved transitively but whose source file
wasn't captured in `componentToFile` would fall back to `familyName = componentName`,
creating one family per such component.

The DS prescan builds families from `componentToSourceFile` (only `info.defined` entries).
Local lib Pass 3 now does the same: iterates `componentToFile` and gets DS-backing from
`componentMap`. No source file → component excluded from familyMap (same as DS prescan).

### Changes
- `src/scanner/library-prescan.ts` — Pass 3: `for ([name, filePath] of componentToFile)`
  instead of `for ([name, entry] of componentMap)`

---

## v0.5.5 — Fix default-exported components causing family overcounting

### Fix: `export default function Foo(){}` not mapping to `componentToFile`

When a component file used `export default function Foo(){}` and a barrel re-exported it
as `export { default as Foo } from './Foo'`, only `'default'` was added to `info.defined`.
This meant:
1. `componentToFile` had no entry for `'Foo'` → Pass 3 family lookup fell back to the
   component name as its own family (one family per component).
2. In `resolveFileExports`, `childExports.get('Foo')` returned `undefined`, falling back
   to the barrel's own DS import status (usually `false`).

With `export default function Foo(){}` now also adding `'Foo'` to `info.defined`, the
component name correctly maps to its defining file → family = directory name (correct).

This was the root cause of 81 families being reported instead of 19 for a library whose
19 feature directories each contained default-exported components.

### Changes
- `src/scanner/library-prescan.ts` — `ExportDefaultDeclaration` handler now also adds the
  component's real name (`FunctionDeclaration.id.name`, `ClassDeclaration.id.name`, or
  plain `Identifier` not in import bindings) to `info.defined` alongside `'default'`
- `tests/unit/library-prescan.test.ts` — regression test:
  `resolves barrel re-export of default-exported component`

---

## v0.5.4 — Fix family overcounting; families-first report

### Fix: `import X; export { X }` incorrectly treated as local definition

`parseFileExports` now correctly tracks all import bindings and, when processing
`export { A }` without a `from` clause, checks whether `A` was previously imported.
If it was, it's treated as a **re-export** (added to `reExports`), not a local definition.

**Before**: a barrel like `import { Foo } from './foo'; export { Foo }` put `Foo` into
`info.defined`, causing `componentToFile['Foo']` to point to the barrel file. If the
barrel was at `src/index.ts` (a GENERIC_DIR), the family fell back to the component name.
Result: 81 families instead of 19 for a library with 19 top-level feature directories.

**After**: only files that truly **declare** a component affect `componentToFile`. Barrel
files (regardless of processing order) no longer pollute family grouping.

### Report: families as primary metric

- **Category Breakdown** (`📦`): when families configured, the `Unique` column is replaced
  by `Families` showing `familiesUsed/totalFamilies (coverage%)` per DS.
- **Top Families per DS** (`🗂️`) section now appears **before** Top Components per DS.
- **Top Components per DS** renamed to `📋 Top Components per DS (detail)` when families
  are shown above; capped at 3 (instead of 5) to reduce noise.

### Changes
- `src/scanner/library-prescan.ts` — `parseFileExports`: tracks `importBindings` in the
  `ImportDeclaration` handler; `export { X }` without source routes to `reExports` when
  `X` is an import binding, otherwise to `defined`
- `src/output/table-reporter.ts` — Category Breakdown families column; Top Families moved
  before Top Components; detail label + cap when families configured
- `tests/unit/library-prescan.test.ts` — renamed 'extracts renamed export specifier' →
  'treats imported-then-re-exported name as reExport not defined'; added test for locally
  defined specifier

Тесты: +1 тест. Итого: **155 тестов**.

---

## v0.5.3 — Local library family grouping + componentsDir

### Local library components grouped into families

Library pre-scan (`libraries[]`) now groups individual components into directory-level
families using the same algorithm as DS prescan. A family = all components in the same
directory. If **any** component in the family is DS-backed → the whole family is DS-backed.

This replaces the previous component-count reporting with a more actionable family-level view.
For example, `@devplatform/spa-ui` with 34 PascalCase exports grouped into 6 feature families
now correctly reports `6 families` instead of `34 components`.

### New `componentsDir` config option for libraries

Libraries with deep directory structures (e.g. `src/components/spirit-ui/{family}/`) can now
specify a `componentsDir` sub-path as the grouping base:

```ts
libraries: [{
  package: '@company/spa-ui',
  backedBy: 'Spirit',
  path: '/path/to/spa-ui',
  componentsDir: 'src/components/spirit-ui', // family = next directory after this
}]
```

Without `componentsDir`, GENERIC_DIRS (`src`, `components`, etc.) are skipped automatically
— works for standard `src/{family}/` structures.

### DS table: `Unique` column removed when families configured

When a DS has family coverage configured (`path`/`git`), the `Families` column already serves
as the uniqueness metric. The `Unique` column (raw component count) has been removed in this
case to reduce noise. It is preserved when no family coverage is available.

### Breaking: libraryPrescan JSON field names changed

`ScanReport.libraryPrescan[]` fields renamed:
- `totalComponents` → `totalFamilies`
- `dsBackedComponents` → `dsBackedFamilies`

### Changes
- `src/config/schema.ts` — `componentsDir?: string` added to `LibrarySource`
- `src/scanner/ds-prescan.ts` — `GENERIC_DIRS` exported (was `const`)
- `src/scanner/library-prescan.ts` — `LibraryFamilyEntry` type; `LibraryRegistry` gets `familyMap`;
  `buildComponentMap` returns `{ componentMap, familyMap }`; Pass 3 builds family groups;
  `getLocalFamilyName()` (same algorithm as DS prescan); `componentToFile` tracking in Pass 1
- `src/scanner/orchestrator.ts` — uses `familyMap` counts for `libraryPrescan` report
- `src/types.ts` — `libraryPrescan[]` fields renamed
- `src/output/table-reporter.ts` — library prescan shows families; DS table drops `Unique` when
  `hasFamilyCoverage`

Тесты: +4 новых теста (familyMap grouping). Итого: **154 теста**.

---

## v0.5.2 — Family Coverage включает DS-backed local-library компоненты

### Единый подсчёт Family Coverage

Раньше `familyCoverage` учитывал только прямые `design-system` использования. Компоненты
локальной библиотеки, обёртывающие DS-компоненты (`ProjectButton` → `Button`), не влияли
на покрытие семей, занижая метрику.

**Теперь**: `familyCoverage` единым образом объединяет прямые DS использования
и DS-backed local-library использования с разрешённой семьёй.

**Принцип**:
- `<Button />` (design-system) → семья `Button` ✅ всегда учитывалось
- `<ProjectButton />` (local-library, backs `Button`) → семья `Button` ✅ теперь учитывается
- `<CustomForm />` (local, без DS) → не учитывается ✅ корректно

### Как работает разрешение семьи для local-library

При пре-скане библиотеки (`libraries[]`) сканер теперь отслеживает, какой конкретно DS-компонент
импортирует каждый файл (`Button`, `Modal`, …) и сопоставляет его с семьёй через `DSCatalog`.
Поле `dsFamily` на `LibraryComponentEntry` заполняется из каталога DS (`preScanDesignSystems`
должен быть выполнен первым — это уже гарантировано порядком Stage 0 → 0.5).

В `transitive-resolver.ts` Case 0 (registry path): `compEntry.dsFamily` теперь копируется
в `CategorizedUsage.componentFamily` вместе с `transitiveDS`.

### Изменения
- `src/scanner/library-prescan.ts` — `ExportInfo.dsImportedNames`; `buildComponentMap` использует
  импортированные DS-имена для разрешения семьи через `dsFamilyLookup`
- `src/scanner/transitive-resolver.ts` — Case 0 propagates `compEntry.dsFamily → componentFamily`
- `src/metrics/calculator.ts` — `calculatePerDSMetrics` включает transitive usages в family set;
  `buildTopFamilies` принимает оба массива (direct + transitive); удалён лишний параметр `families`
- `src/types.ts` — комментарий к `familiesUsed` уточнён (direct + DS-backed local-library)

Тесты: +8 новых тестов (6 в `calculator.test.ts`, 2 в `library-prescan.test.ts`). Итого: **150 тестов**.

---

## v0.5.1 — Fix: глубоко вложенные сабкомпоненты объединяются в родительскую семью

### Исправление алгоритма группировки семей

Ранее `getFamilyName` смотрел только на **ближайшую родительскую директорию**. Если сабкомпонент
жил в собственной подпапке (`EmptyState/EmptyStateButton/EmptyStateButton.tsx`), он создавал
отдельную семью `EmptyStateButton` вместо того, чтобы присоединиться к семье `EmptyState`.

**Новый алгоритм**: берём путь от корня DS до файла, пропускаем ведущие GENERIC-директории
(`src`, `components`, `lib`, …), первый оставшийся сегмент — имя семьи. Работает на любой
глубине вложенности.

| Структура DS | Раньше | Теперь |
|---|---|---|
| `EmptyState/EmptyStateButton/Btn.tsx` | семья `EmptyStateButton` ❌ | семья `EmptyState` ✅ |
| `EmptyState/src/EmptyStateNoData.tsx` | семья `EmptyStateNoData` ❌ | семья `EmptyState` ✅ |
| `src/components/Button/ButtonGroup.tsx` | семья `Button` ✅ | семья `Button` ✅ |
| `Button/Button.tsx` | семья `Button` ✅ | семья `Button` ✅ |

Тесты: +3 новых теста в `ds-prescan.test.ts`. Итого: **142 теста**.

---

## v0.5.0 — DS Component Family Pre-Scan & Family Coverage Metrics

### Новая метрика: Family Coverage

Сканер теперь поддерживает пре-скан исходников дизайн-системы и считает покрытие по
**семьям компонентов** — основным бизнес-единицам DS, а не по числу инстансов.

**Семья компонентов** = все компоненты в одной директории. Пример: `EmptyState/EmptyState.tsx`,
`EmptyState/EmptyStateError.tsx`, `EmptyState/EmptyStateNotFound.tsx` → одна семья `EmptyState`.
Это продуктовая метрика: "Команды используют 30 из 50 компонентов DS (60% покрытие)".

### Конфиг: `path` для `designSystems`

```typescript
designSystems: [
  {
    name: 'MyDS',
    packages: ['@myds/ui'],
    path: '../myds-repo/packages/ui',  // путь к исходникам DS
    groupBy: 'directory',              // 'directory' (по умолчанию) | 'none'
  },
],
```

- `path` — локальный путь к исходникам DS
- `git` — URL для автоклона (кэш в `historyDir/.ds-cache/`)
- `groupBy: 'directory'` — папка = семья (по умолчанию)
- `groupBy: 'none'` — каждый компонент = отдельная "семья"

### Новые поля в JSON-отчёте

```json
"summary": {
  "designSystems": [{
    "dsName": "MyDS",
    "totalFamilies": 15,
    "familiesUsed": 9,
    "familyCoverage": 60.0,
    "topFamilies": [
      { "family": "Button", "components": ["Button", "ButtonGroup"],
        "instances": 42, "filesUsedIn": 18, "reposUsedIn": 2 }
    ]
  }]
},
"dsPrescan": [{
  "dsName": "MyDS",
  "totalFamilies": 15,
  "totalComponents": 38,
  "familiesCoveredInScan": 9,
  "coveragePct": 60.0
}]
```

Также: `CategorizedUsage.componentFamily` — имя семьи для каждого DS-компонента (используется
при выводе `byComponent`).

### Новые поля в табличном выводе

- **Колонка "Families"** в таблице `📐 Per Design System`: `9/15 (60.0%)`
- **Секция `🎨 Design System Catalog`**: таблица всех семей с числом компонентов и покрытием
- **Секция `🗂️ Top Families per DS`**: топ-5 семей по числу инстансов

### Алгоритм группировки (directory-based)

- `family = path.basename(path.dirname(filePath))`
- Если родительская директория — "generic container" (`src`, `components`, `lib`, `ui`, `shared`)
  или файл лежит в корне DS → `family = componentName`
- Только PascalCase-экспорты отслеживаются (TypeScript interfaces/types исключены)
- Только локально-определённые экспорты (не ре-экспорты из барелей) создают семьи

### Библиотечный пре-скан: поддержка `dsFamily`

`preScanLibraries(config, dsCatalog)` теперь принимает `DSCatalog` и заполняет
`componentMap.get('X').dsFamily` — к какой семье DS относится компонент библиотеки.

### Тесты

- `tests/unit/ds-prescan.test.ts` — 17 новых тестов (buildFamilyCatalog, buildFamilyLookup,
  preScanDesignSystems, группировка, статический fixture)
- `tests/unit/family-resolver.test.ts` — 9 новых тестов (enrichWithFamily, alias lookup,
  non-DS категории, edge cases)
- `tests/fixtures/ds-source/` — тестовый fixture DS: 3 семьи, 6 компонентов
- Обновлены `tests/unit/library-prescan.test.ts` — новая сигнатура `preScanLibraries`
- **Итого: 139 тестов (было 113)**

---

## v0.4.0 — Local Component Reuse Analysis

### Новая секция отчёта: `localReuseAnalysis`

Сканер теперь анализирует локальные компоненты и выделяет кандидатов на
замену дизайн-системой — те, которые импортируются из нескольких мест.

**Критерий идентичности**: `resolvedPath` (абсолютный путь к исходному файлу).
Если несколько consumer-файлов импортируют один и тот же файл — это реальное переиспользование.
Компоненты, определённые inline в том же файле (`resolvedPath == null`) — всегда синглтоны.

**Три класса компонентов:**
- `singleton` — используется в 1 файле; page-specific, не кандидат на DS
- `local-reuse` — 2+ файлов, 1 репо; потенциальный кандидат на вынос в `local-library`
- `cross-repo` — 2+ репо; сильнейший сигнал для DS-миграции

**В JSON-отчёте** — новое поле `localReuseAnalysis`:
```json
"localReuseAnalysis": {
  "totalTracked": 312,
  "inlineCount": 847,
  "singletonCount": 280,
  "localReuseCount": 25,
  "crossRepoCount": 7,
  "topCandidates": [
    { "componentName": "FormField", "resolvedPath": "/repo/src/FormField.tsx",
      "instances": 45, "filesUsedIn": 12, "reposUsedIn": 3 }
  ]
}
```

**В табличном выводе** — секция `♻️ Reuse Opportunities` появляется, если есть компоненты
с `filesUsedIn >= 2`. Показывает сводку (`N singletons · M local-reuse · K cross-repo`)
и таблицу топ-10 кандидатов с числом инстанций, файлов и репозиториев.

**Не требует изменений конфига** — работает автоматически для всех `local`-компонентов.

---

## v0.3.0 — excludeLocalFromAdoption

### Новая опция конфига: `excludeLocalFromAdoption`

```typescript
excludeLocalFromAdoption: true
```

Исключает `local` (Local/Custom) компоненты из знаменателя adoption.

**Когда использовать**: когда уникальные продуктовые компоненты — ожидаемая норма,
и нужно измерять только DS vs общие библиотеки. Формула становится:

```
DS / (DS + local-library) × 100   вместо   DS / (DS + local-library + local) × 100
```

**В отчёте**:
- Рядом с adoption rate появляется `(local excl.)`
- В Category Breakdown колонка Share для Local/Custom показывает `excluded`
- Флаг сохраняется в `ScanReport.meta.excludeLocalFromAdoption` для корректного рендеринга

**`local` vs `local-library`**: оба — относительные импорты из файлов проекта.
Компоненты из `localLibraryPatterns` → `local-library`; остальные → `local`.
`local-library` участвует в авто-детекции транзитивного адопшена, `local` — нет.

---

## v0.2.0 — Transitive Adoption (Auto-Detection Improvements)

### Упрощение API: `coverage` больше не нужен

`coverage` в `transitiveRules` теперь опциональный. Если не указан — сканер
определяет его автоматически. Указывать нужно только как override.

**Было:**
```typescript
transitiveRules: [
  { package: '@ant-design/pro-components', backedBy: 'Ant Design', coverage: 1.0 },
]
```

**Стало:**
```typescript
transitiveRules: [
  { package: '@ant-design/pro-components', backedBy: 'Ant Design' },
]
transitiveAdoption: { enabled: true }
```

### Авто-детект для third-party через `package.json`

Для правил без явного `coverage` и `transitiveAdoption.enabled: true` сканер проверяет
`node_modules/{package}/package.json`:
- Если DS-пакет найден в `dependencies` / `peerDependencies` / `optionalDependencies` → `coverage: 1.0`
- Если не найден → правило пропускается (не считается)
- Если пакет не установлен в `node_modules` → правило пропускается (консервативно)

Этот подход надёжнее сканирования исходников: `peerDependencies` — это
официальная декларация о зависимости от DS.

Для **local-library** поведение прежнее: парсинг исходника каждого компонента
по `resolvedPath`, проверка прямых DS-импортов.

### Bug fixes

- **`effective < direct`**: при сканировании исходников ESM-бандлов компоненты
  редко импортировали DS напрямую (внутренние зависимости), что давало низкий
  coverage и уменьшало `effectiveAdoptionRate`. Исправлено переходом на
  `package.json` проверку.

- **`pkg: C:`**: в проектах с UmiJS или аналогичными фреймворками генерированные
  файлы могли содержать импорты по абсолютным Windows-путям. `extractPackageName`
  теперь корректно обрабатывает такие пути, извлекая имя пакета из части после
  `/node_modules/`.

### Таблица Repository Breakdown

При наличии транзитивного адопшена таблица репозиториев теперь показывает
отдельную колонку `Effective` рядом с `Total DS`:

```
Repository       Ant Design   Total DS   Effective   Local
ant-design-pro     68.6%       68.6%      79.7%      31.4%
```

---

## v0.1.0 — Initial Implementation + Transitive Adoption (основа)

### Что добавляется

Поддержка **транзитивного адопшена**: учёт дизайн-системы в adoption rate,
когда local-library или third-party пакет сам построен на основе DS.

**Два механизма обнаружения:**
- **Declarative** (`transitiveRules` в конфиге) — для third-party и local-library,
  когда покрытие частичное (0–1) или авто-детекция недоступна.
- **Auto-detect** (`transitiveAdoption.enabled: true`) — для local-library с известным
  `resolvedPath`: парсим исходник, ищем DS-импорты (1 уровень глубины).

**Два отдельных показателя:**
- `adoptionRate` — прямой, только явные DS-импорты (формула не меняется)
- `effectiveAdoptionRate` — с учётом транзитивных (новый)

---

## Изменения по файлам

### `src/config/schema.ts`
- Добавить `TransitiveRule` (package, backedBy, coverage?)
- Добавить `TransitiveAdoptionConfig` (enabled?)
- Добавить в `DSScannerConfig`: `transitiveRules?`, `transitiveAdoption?`
- Обновить `ResolvedConfig`: включить новые поля как обязательные

### `src/config/loader.ts`
- В `mergeWithDefaults()`: `transitiveRules: []`, `transitiveAdoption: { enabled: false }`
- Добавить валидацию: `rule.backedBy` должен совпадать с `designSystems[].name`

### `src/types.ts`
- `CategorizedUsage` + поле `transitiveDS?: { dsName, coverage, source }`
- `DesignSystemMetrics` + поля `effectiveAdoptionRate`, `transitiveInstances`, `transitiveWeighted`
- `ScanMetrics` + поля `effectiveAdoptionRate`, `transitiveDS` (статистика)
- `RepositoryReport` + поле `effectiveAdoptionRate`; `designSystems[]` + `effectiveAdoptionRate`, `transitiveInstances`
- `ScanReport.summary` + поле `effectiveAdoptionRate`; `designSystems[]` + `effectiveAdoptionRate`, `transitiveInstances`

### `src/scanner/transitive-resolver.ts` — НОВЫЙ ФАЙЛ
```typescript
// Авто-детектирование DS в исходниках local-library компонентов
export interface TransitiveDetection {
  dsName: string;
  coverage: number;        // 1.0 для авто-детекции
  source: 'auto-detected';
}

// Обогащает categorized usages полем transitiveDS через авто-детекцию
export async function enrichWithTransitiveDS(
  usages: CategorizedUsage[],
  config: ResolvedConfig,
  cache?: Map<string, TransitiveDetection | null>
): Promise<CategorizedUsage[]>
```
- Кешируем по resolvedPath (новый Map на каждый вызов или передаётся снаружи)
- Пропускаем usages с уже установленным `transitiveDS` (declarative wins)
- Пропускаем категории кроме `local-library`
- Пропускаем если `!config.transitiveAdoption.enabled`
- Используем `parseFile()` из `scanner/parser.ts`
- Используем `findDesignSystem()` из `scanner/categorizer.ts`

### `src/scanner/categorizer.ts`
- Добавить `applyTransitiveRule(categorized, config)` — sync, проверяет `config.transitiveRules`
- Вызвать `applyTransitiveRule()` в конце `categorizeUsage()` для local-library и third-party
- Использовать существующий `matchesPackage()` для сопоставления правил

### `src/scanner/orchestrator.ts`
- Импортировать `enrichWithTransitiveDS`
- После `processWithConcurrency`, перед `repoData.push()`:
  ```typescript
  const transitiveCache = new Map();
  const finalUsages = await enrichWithTransitiveDS(repoUsages, config, transitiveCache);
  ```
- `repoData.push({ ..., usages: finalUsages })`

### `src/metrics/calculator.ts`
- `calculateMetrics()`: добавить расчёт `effectiveAdoptionRate`, `transitiveDS`
- `calculatePerDSMetrics()`: добавить `transitiveInstances`, `transitiveWeighted`, `effectiveAdoptionRate`
- Формула знаменателя effective: `denominator + count(third-party с transitiveDS)`
- Формула числителя effective: `dsUsages.length + transitiveWeightedTotal`

### `src/metrics/aggregator.ts`
- `buildRepositoryReport()`: добавить `effectiveAdoptionRate`, обновить per-DS в `designSystems[]`
- `aggregateResults()`: добавить `effectiveAdoptionRate` в summary и per-DS breakdown

### `src/output/table-reporter.ts`
- В секции Total Adoption: вывести строки Direct и Effective с дельтой
- В per-DS таблице: добавить колонку `Effective%` и `+Transitive`
- Если `effectiveAdoptionRate === adoptionRate`: не показывать Effective строку (нет транзитивных)

---

## Формула effective adoption

```
transitive_weighted = Σ usage.transitiveDS.coverage  (local-lib + third-party с transitiveDS)
transitive_third_party = count(third-party с transitiveDS)

direct_denominator   = DS + local-lib + local            (без изменений)
effective_denominator = direct_denominator + transitive_third_party

adoptionRate          = DS / direct_denominator × 100
effectiveAdoptionRate = (DS + transitive_weighted) / effective_denominator × 100
```

---

## Важные ограничения

- `transitiveRule.backedBy` ДОЛЖЕН совпадать с `designSystems[].name` — иначе игнорируется
- Авто-детекция: только 1 уровень глубины, только local-library
- Авто-детекция: ищет DS-импорты в файле (не рекурсивно через его импорты)
- Declarative rule имеет приоритет над авто-детекцией для того же usage
- `adoptionRate` (прямой) не изменяется — обратная совместимость сохранена

---

## Пример конфига

```typescript
export default defineConfig({
  designSystems: [{ name: 'TUI', packages: ['@tui/components'] }],

  // Declarative: @company/shared-ui на 100% построен на TUI
  transitiveRules: [
    { package: '@company/shared-ui', backedBy: 'TUI', coverage: 1.0 },
    { package: '@admin-kit', backedBy: 'TUI', coverage: 0.8 },
  ],

  // Auto-detect: сканируем исходники local-library
  transitiveAdoption: { enabled: true },
});
```
