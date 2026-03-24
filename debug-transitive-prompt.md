# Debug Prompt: Transitive Usages Mismatch

Промпт для локального ИИ-агента с доступом к исходному коду.

---

Ты помогаешь отладить инструмент DS Adoption Scanner (TypeScript, Node.js).
Это CLI, который сканирует React-репозитории и считает, сколько компонентов взято из
дизайн-системы. Есть конкретная проблема — опишу её максимально точно.

---

## ПРОБЛЕМА

В HTML-отчёте есть две цифры, которые должны совпадать, но не совпадают:
1. "Transitive (DS-backed)" в таблице Category Breakdown — назовём её N
2. "Transitive Usages" в таблице Transitive Dependency Chains — для каждой библиотеки своя цифра

Кроме того, некоторые библиотеки в таблице Dependency Chains показывают "—" (ноль),
хотя точно должны быть ненулевыми.

---

## КАК РАБОТАЕТ КОД (кратко)

### Ключевые файлы:

**src/types.ts** — типы данных
- `CategorizedUsage` — одно JSX-использование компонента. Содержит поле:
  ```
  transitiveDS?: {
    dsName: string;
    coverage: number;
    source: 'declared' | 'auto-detected';
    libraryPackage?: string;  // ключ из libraries[] — какая либа подтвердила DS-backing
  }
  ```
- `category` может быть: 'design-system', 'local-library', 'third-party', 'local', 'html-native'

**src/scanner/transitive-resolver.ts** — определяет, является ли компонент DS-backed
- **Case 0** (строки ~56–101): если компонент из библиотеки в `libraryRegistry` →
  проверяет componentMap и familyMap, ставит `transitiveDS` с `libraryPackage = lookupName`
- **Family fallback A** (~строки 75–81): по пути файла (libBase vs resolvedPath)
- **Family fallback B** (~строки 83–97): по имени компонента — конвертирует "empty-state" → "EmptyState",
  проверяет `componentName.startsWith(camelPrefix)`
- **Case 1** (~строки 104–113): для local-library без аннотации — auto-detect из source file
- **Case 2** (~строки 116–152): для third-party с declarative rule

**src/scanner/orchestrator.ts** — после скана считает `transitivePerPkg`:
```typescript
for (const u of allUsages) {
  if (u.category !== 'local-library' || !u.transitiveDS) continue;
  const pkgName = u.transitiveDS.libraryPackage
    ?? /* fallback: parse u.importEntry.source */;
  transitivePerPkg.set(pkgName, (transitivePerPkg.get(pkgName) ?? 0) + 1);
}
```
Это число идёт в `report.libraryPrescan[].transitiveUsages`.

**src/metrics/calculator.ts** — считает метрики:
```
transitiveLocalLib = usages.filter(u => u.category === 'local-library' && u.transitiveDS)
effectiveAdoptionRate = (DS + transitiveLocalLib.length) / denominator × 100
```
Это число идёт в Category Breakdown как "Transitive (DS-backed)".

**src/scanner/library-prescan.ts** — пре-скан исходников библиотек
- Строит `LibraryRegistry`: Map<packageName, { componentMap, familyMap, backedBy, libBase, viaPackage }>
- `componentMap`: Map<componentName, { isDSBacked, dsFamily }>
- `familyMap`: Map<directoryName, { isDSBacked }>
- `libBase`: абсолютный путь к корню исходников библиотеки

---

## ЧТО НУЖНО ПРОВЕРИТЬ

### Гипотеза 1: libraryPackage не ставится для некоторых usages

Посмотри в `src/scanner/transitive-resolver.ts` Case 0.
Убедись, что `libraryPackage: lookupName` стоит в блоке `if (isDSBacked)`.
Проверь: нет ли путей, по которым компонент помечается DS-backed (например через Family fallback B),
но `libraryPackage` при этом не ставится.

### Гипотеза 2: lookupName не совпадает с ключом в libraryRegistry ⚠️ НАИБОЛЕЕ ВЕРОЯТНАЯ

В orchestrator.ts ключ `u.transitiveDS.libraryPackage` должен точно совпадать
с ключом в `libraryRegistry` (который равен `lib.package` из конфига).

Проверь: что возвращает `findRegistryEntry()` в transitive-resolver.ts? Он делает
точный матч ИЛИ pattern-матч (через `matchesPackage`). Значит если библиотека
зарегистрирована как `"@t-spirit/spa-beaver-ui"`, а `lookupName` = `"@t-spirit/spa-beaver-ui/empty-state"`,
то `matchesPackage` может их сматчить. Но `lookupName` при этом будет subpath `"@t-spirit/spa-beaver-ui/empty-state"`,
а не `"@t-spirit/spa-beaver-ui"` — и transitivePerPkg не найдёт совпадение при подсчёте.

**ВЕРОЯТНО ЗДЕСЬ БАГ**: `libraryPackage` нужно ставить равным ключу регистри (bare package name),
а не `lookupName` (который может быть subpath). Посмотри как `findRegistryEntry` возвращает данные
— он возвращает значение map, но не возвращает ключ! Нужно также вернуть ключ.

**Как исправить**: изменить `findRegistryEntry` чтобы возвращал и ключ:
```typescript
function findRegistryEntry(registry, packageName): { key: string; entry: ... } | null {
  if (registry.has(packageName)) return { key: packageName, entry: registry.get(packageName)! };
  for (const [pattern, entry] of registry) {
    if (matchesPackage(packageName, pattern)) return { key: pattern, entry };
  }
  return null;
}
```
И в Case 0 использовать `libResult.key` как `libraryPackage`, а не `lookupName`.

### Гипотеза 3: usages не попадают в local-library

Убедись, что в `config.localLibraryPatterns` есть все пакеты из `libraries[]`.
В `src/config/loader.ts` функция `mergeWithDefaults` должна автоматически добавлять их:
```typescript
const libraryPackages = (userConfig.libraries ?? []).map(l => l.package).filter(Boolean);
const localLibraryPatterns = [...basePatterns, ...libraryPackages.filter(...)];
```
Если этого нет — usages будут иметь category='third-party' и не учтутся в transitiveLocalLib.

### Гипотеза 4: Family fallback B не работает для некоторых имён

Проверь логику в Family fallback B: конвертация kebab-case → CamelCase.
Например: "empty-state" → split по [-_] → ["empty", "state"] → capitalize each → ["Empty", "State"] → join → "EmptyState".
Убедись что это правильно и `"EmptyStateNoData".startsWith("EmptyState")` = true.

---

## ЧТО НУЖНО СДЕЛАТЬ

1. Прочитай файлы:
   - `src/scanner/transitive-resolver.ts`
   - `src/scanner/orchestrator.ts`
   - `src/scanner/library-prescan.ts`
   - `src/config/loader.ts`

2. Проверь все 4 гипотезы выше по порядку, начни с Гипотезы 2.

3. Если нашёл баг — опиши его точно:
   - В каком файле и на какой строке
   - Что именно делает код неправильно
   - Как исправить (покажи изменённый код)

4. Если баг найден и понятен — исправь его напрямую в файле.

5. Если все гипотезы верны и баг не найден — напиши временный debug-код,
   который можно добавить в orchestrator.ts чтобы залогировать промежуточные значения:
   ```typescript
   console.log('[DEBUG] usage:', u.componentName, u.category, u.transitiveDS?.libraryPackage, u.importEntry?.source);
   ```

---

## КОНТЕКСТ: правильное поведение

После скана должно выполняться равенство:
```
sum(report.libraryPrescan[].transitiveUsages) === report.summary.transitiveDS.totalInstances
```

Потому что оба считают одно и то же: количество `local-library` usages с `transitiveDS`.
Если это не так — значит в counting есть баг.
