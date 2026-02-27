# Transitive DS Adoption — Changes

## Что добавляется

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
