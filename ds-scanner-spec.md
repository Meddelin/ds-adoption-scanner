# DS Adoption Scanner — Техническая спецификация для Claude Code

## 🎯 Цель проекта

CLI-инструмент для подсчёта adoption дизайн-системы в 10+ React/TypeScript репозиториях.
Сканирует JSX-компоненты, категоризирует их по источнику (DS / локальная библиотека / кастом / third-party / HTML),
рассчитывает adoption rate и генерирует отчёты.

**Вдохновлён**: omlet.dev (подход к категоризации и метрикам), react-scanner (AST-парсинг).

**Ключевое отличие от аналогов**: статические AI-инструкции в пакете, позволяющие
любому AI-агенту (Cursor, Claude Code, Aider) работать с результатами сканирования
для обнаружения "теневых" дубликатов, уточнения категоризации и генерации аналитики.

---

## 📦 Стек технологий

### Core
- **Язык**: TypeScript (строгий режим)
- **Рантайм**: Node.js >= 18
- **Сборка**: tsup (ESM + CJS)
- **CLI фреймворк**: `commander`

### AST и парсинг
- **Парсер**: `@typescript-eslint/typescript-estree` — парсинг .ts/.tsx/.js/.jsx в ESTree AST
- **Traversal**: `@typescript-eslint/typescript-estree` встроенный walker или простой рекурсивный визитор
- **Module resolution**: `typescript` (только `ts.resolveModuleName()` и `ts.readConfigFile()`)
- **File discovery**: `fdir` — быстрый directory crawler
- **Glob matching**: `picomatch` — для include/exclude паттернов

### Output
- **Таблицы**: `cli-table3`
- **Цвета**: `chalk`
- **Прогресс**: `ora` (спиннер)

---

## 🏗 Архитектура

```
ds-scanner/
├── src/
│   ├── cli.ts                    # Entry point, commander setup
│   ├── config/
│   │   ├── loader.ts             # Загрузка и валидация конфига
│   │   ├── schema.ts             # TypeScript типы конфига
│   │   └── defaults.ts           # Дефолтные значения
│   ├── scanner/
│   │   ├── file-discovery.ts     # Поиск файлов через fdir
│   │   ├── parser.ts             # AST парсинг одного файла
│   │   ├── import-resolver.ts    # Резолв импортов через TS API
│   │   ├── jsx-extractor.ts      # Извлечение JSX usage из AST
│   │   ├── categorizer.ts        # Категоризация компонентов
│   │   ├── transitive-resolver.ts # Авто-детектирование DS в исходниках local-library
│   │   ├── library-prescan.ts    # Пре-скан sources libraries[]: per-component DS-backing + dsFamily
│   │   ├── ds-prescan.ts         # Пре-скан исходников DS → DSCatalog (семьи компонентов)
│   │   ├── family-resolver.ts    # enrichWithFamily(): назначает componentFamily per usage
│   │   └── orchestrator.ts       # Оркестрация полного скана
│   ├── metrics/
│   │   ├── calculator.ts         # Расчёт adoption метрик
│   │   ├── aggregator.ts         # Агрегация по репо/компоненту + buildLocalReuseAnalysis()
│   │   └── history.ts            # Сравнение с предыдущими сканами
│   ├── output/
│   │   ├── json-reporter.ts      # JSON вывод
│   │   ├── table-reporter.ts     # CLI-таблицы
│   │   └── csv-reporter.ts       # CSV вывод
│   └── types.ts                  # Общие TypeScript типы
├── .ds-scanner.config.ts         # Пример конфига
├── ai-instructions/              # Статические инструкции для AI-агентов
│   ├── README.md
│   ├── shadow-detection.md
│   ├── categorization.md
│   ├── report.md
│   └── transitive-adoption.md
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📝 Конфигурация

### Файл конфига: `.ds-scanner.config.ts`

```typescript
import { defineConfig } from 'ds-adoption-scanner';

export default defineConfig({
  // ===== Обязательные поля =====

  // Пути к репозиториям для сканирования
  repositories: [
    '/path/to/repo-1',
    '/path/to/repo-2',
    // Поддержка glob:
    // '/projects/frontend/*'
  ],

  // Дизайн-системы — ядро конфигурации
  // Каждая DS — именованная группа пакетов
  // В отчёте adoption считается и суммарно, и по каждой DS отдельно
  designSystems: [
    {
      name: 'TUI',                    // Человекочитаемое имя для отчёта
      packages: [
        '@tui/components',
        '@tui/icons',
        '@tui/tokens',
      ],
    },
    {
      name: 'Beaver',
      packages: [
        'beaver-ui',
        'beaver-ui/*',               // Поддержка подпакетов
        '@beaver/patterns',
      ],
    },
    // Можно добавить хоть 5 DS если нужно:
    // { name: 'Mobile DS', packages: ['@mobile-ui/components'] },
  ],

  // ===== Опциональные поля =====

  // Паттерны включения файлов (по умолчанию ниже)
  include: ['src/**/*.{ts,tsx,js,jsx}'],

  // Паттерны исключения файлов
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/*.d.ts',
  ],

  // Локальные/shared библиотеки компонентов
  // Матчатся по import specifier И по resolved file path
  localLibraryPatterns: [
    '@shared/components',
    '@shared/components/*',
    '**/shared/ui/**',
    '**/common/components/**',
  ],

  // Third-party пакеты для отдельного трекинга (опционально)
  trackedThirdParty: [
    '@mui/material',
    'antd',
    'react-select',
  ],

  // Путь к tsconfig относительно каждого репозитория
  tsconfig: 'tsconfig.json',

  // Директория с результатами сканов (AI-агент читает отсюда)
  historyDir: './.ds-metrics',

  // Настройки вывода
  output: {
    format: 'table',           // 'json' | 'table' | 'csv'
    path: undefined,           // Если указан — сохраняет в файл
    verbose: false,            // Включает per-file breakdown
  },

  // Пороги для CI (опционально)
  thresholds: {
    minAdoptionRate: undefined,     // Фейлить если СУММАРНЫЙ adoption ниже (%)
    maxCustomComponents: undefined, // Предупреждать если кастом выше
    // Per-DS пороги (опционально)
    perDesignSystem: {
      // 'TUI': { minAdoptionRate: 40 },
      // 'Beaver': { minAdoptionRate: 20 },
    },
  },

  // Директория для хранения истории сканов
  historyDir: './.ds-metrics',

  // ===== Транзитивный адопшен =====

  // Декларативные правила для third-party пакетов и local-library,
  // которые сами построены на основе ваших дизайн-систем.
  // Использования таких пакетов учитываются в effectiveAdoptionRate.
  transitiveRules: [
    {
      package: '@company/shared-ui', // npm-пакет или паттерн (как designSystems.packages)
      backedBy: 'TUI',               // имя DS из designSystems[].name
      coverage: 1.0,                 // 0.0–1.0: доля компонентов пакета, основанных на DS
    },
    {
      package: '@admin-kit',
      backedBy: 'Beaver',
      coverage: 0.8,                 // 80% компонентов admin-kit построены на Beaver
    },
  ],

  // Авто-сканирование исходников local-library для обнаружения транзитивного адопшена.
  // Работает только для local-library с известным resolvedPath (не node_modules).
  // При включении: если исходник компонента импортирует из DS-пакета → coverage: 1.0.
  // Декларативные transitiveRules имеют приоритет над авто-детекцией.
  transitiveAdoption: {
    enabled: false, // default false — не сканируем source файлы без явного разрешения
  },
});
```

### Тип конфига

```typescript
interface DSScannerConfig {
  repositories: string[];
  designSystems: DesignSystemDef[];
  include?: string[];
  exclude?: string[];
  localLibraryPatterns?: string[];
  trackedThirdParty?: string[];
  tsconfig?: string;
  output?: OutputConfig;
  thresholds?: ThresholdConfig;
  historyDir?: string;
  transitiveRules?: TransitiveRule[];
  transitiveAdoption?: TransitiveAdoptionConfig;
}

interface DesignSystemDef {
  name: string;        // Имя DS для отчёта ("TUI", "Beaver")
  packages: string[];  // npm-пакеты, относящиеся к этой DS
}

// Декларативное правило: пакет X построен на DS Y с покрытием C
interface TransitiveRule {
  package: string;    // npm-пакет или паттерн (аналогично designSystems.packages)
  backedBy: string;   // имя DS из designSystems[].name — только существующие DS учитываются
  coverage?: number;  // 0.0–1.0, какая доля компонентов основана на DS (default: 1.0)
}

interface TransitiveAdoptionConfig {
  enabled?: boolean;  // авто-сканировать источники local-library (default: false)
}

interface OutputConfig {
  format: 'json' | 'table' | 'csv';
  path?: string;
  verbose?: boolean;
}

interface ThresholdConfig {
  minAdoptionRate?: number;
  maxCustomComponents?: number;
  perDesignSystem?: Record<string, { minAdoptionRate?: number }>;
}
```

---

## 🔍 Core Scanner Pipeline

### Stage 1: File Discovery (`file-discovery.ts`)

Используем `fdir` для быстрого обхода директорий.

**Input**: массив путей к репозиториям + include/exclude паттерны
**Output**: `Map<string, string[]>` — repository path → массив file paths

```typescript
interface DiscoveryResult {
  repository: string;           // Путь к репозиторию
  repositoryName: string;       // Имя (последний сегмент пути)
  files: string[];              // Абсолютные пути к файлам
  totalFiles: number;
}
```

Логика:
1. Для каждого пути в `repositories`:
   - Если путь содержит glob → развернуть через picomatch
   - Иначе использовать как есть
2. Для каждого репозитория запустить `fdir`:
   - Фильтровать по расширениям: `.ts`, `.tsx`, `.js`, `.jsx`
   - Применить include паттерны (picomatch)
   - Применить exclude паттерны (picomatch)
3. Вернуть результат с подсчётом

### Stage 2: Parse & Extract (`parser.ts`, `jsx-extractor.ts`)

Парсим каждый файл и извлекаем два набора данных: карту импортов и JSX usage.

**Типы данных**:

```typescript
// Запись об одном импорте в файле
interface ImportEntry {
  localName: string;       // Локальное имя в файле ("Btn")
  importedName: string;    // Оригинальное имя ("Button") или "default"
  source: string;          // Module specifier ("@tui/components")
  type: 'named' | 'default' | 'namespace';
}

// Карта импортов: localName → ImportEntry
type ImportMap = Map<string, ImportEntry>;

// Запись об использовании JSX-элемента
interface JSXUsageRecord {
  componentName: string;       // "Button", "Select.Option"
  localName: string;           // Как используется в коде ("Btn", "DS.Button")
  importEntry: ImportEntry | null;  // null для HTML или неразрезолвленных
  filePath: string;
  line: number;
  column: number;
  props: string[];             // Список имён пропсов ["variant", "size"]
  hasSpreadProps: boolean;     // Есть ли {...props}
}

// Результат парсинга одного файла
interface FileParseResult {
  filePath: string;
  imports: ImportMap;
  jsxUsages: JSXUsageRecord[];
  errors: string[];            // Ошибки парсинга (не фейлим весь скан)
}
```

**Алгоритм парсинга файла**:

1. Прочитать содержимое файла
2. Распарсить через `@typescript-eslint/typescript-estree` с параметрами:
   ```typescript
   parse(code, {
     jsx: true,
     loc: true,
     range: true,
     tokens: false,      // Не нужны для нашей задачи
     comment: false,
     errorOnUnknownASTType: false,
   })
   ```
3. Первый проход по AST — собрать ImportMap:
   - `ImportDeclaration` → для каждого specifier:
     - `ImportSpecifier` → named import (`imported.name`, `local.name`)
     - `ImportDefaultSpecifier` → default import
     - `ImportNamespaceSpecifier` → namespace import (`* as X`)
4. Второй проход — собрать JSX usages:
   - `JSXOpeningElement` с `name`:
     - `JSXIdentifier` (name="Button") → простой компонент, lookup в ImportMap по name
     - `JSXMemberExpression` (object.name="DS", property.name="Button") → lookup object в ImportMap, записать "DS.Button" / "Select.Option"
   - Для каждого JSX элемента собрать props:
     - `JSXAttribute` → добавить имя в массив props
     - `JSXSpreadAttribute` → установить hasSpreadProps = true
   - Определить: если имя начинается с маленькой буквы → это HTML native, importEntry = null

### Stage 3: Import Resolution (`import-resolver.ts`)

Резолвим относительные и aliased импорты в реальные файловые пути.

```typescript
interface ResolvedImport {
  originalSource: string;      // "@components/Button"
  resolvedPath: string | null; // "/repo/src/components/Button/index.tsx"
  isNodeModule: boolean;       // false
  packageName: string | null;  // null (или "@tui/components" для node_modules)
}
```

**Алгоритм**:

1. При старте скана репозитория — один раз прочитать tsconfig:
   ```typescript
   const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
   const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
   const resolutionCache = ts.createModuleResolutionCache(repoRoot, (x) => x);
   ```

2. Для каждого уникального `(source, containingFile)`:
   - Если source не начинается с `.` и не алиас из paths → это node_module
     - Извлечь имя пакета: `@scope/name` или `name` (первые 1-2 сегмента)
     - Вернуть `{ isNodeModule: true, packageName }`
   - Иначе → резолвить через TypeScript:
     ```typescript
     const result = ts.resolveModuleName(source, containingFile, parsed.options, ts.sys, resolutionCache);
     ```
   - Закэшировать результат

3. Кэширование: `Map<string, ResolvedImport>` с ключом `${source}::${containingFile}`

### Stage 4: Categorization (`categorizer.ts`)

Каждый JSX usage получает категорию на основе import info и resolved path.

```typescript
type ComponentCategory =
  | 'design-system'    // Из DS пакетов (конкретная DS указана в dsName)
  | 'local-library'    // Из shared/internal library
  | 'third-party'      // Из прочих node_modules
  | 'local'            // Локальные компоненты проекта
  | 'html-native';     // HTML элементы (div, span и т.д.)

interface CategorizedUsage extends JSXUsageRecord {
  category: ComponentCategory;
  dsName: string | null;       // Имя DS ("TUI", "Beaver") — только для category === 'design-system'
  packageName: string | null;  // Для node_modules
  resolvedPath: string | null; // Для локальных

  // Транзитивная аннотация — присваивается local-library / third-party,
  // если они сами построены на DS. Не меняет category.
  transitiveDS?: {
    dsName: string;                          // DS из config.designSystems[].name
    coverage: number;                        // 0.0–1.0
    source: 'declared' | 'auto-detected';   // declared = из transitiveRules
  };
}
```

**Правила категоризации (в порядке приоритета)**:

```
1. Имя начинается с lowercase → 'html-native'
2. Нет importEntry (определён в том же файле) → 'local'
3. importEntry.source матчит packages из ОДНОЙ из designSystems
   → 'design-system' + dsName = название этой DS
   (проверяются все designSystems по порядку, первый матч побеждает)
4. importEntry.source матчит localLibraryPatterns
   ИЛИ resolvedPath матчит localLibraryPatterns → 'local-library'
5. Не-relative import (не начинается с . или /) → 'third-party'
6. Всё остальное → 'local'
```

**Транзитивная аннотация** (применяется после категоризации, только к 'local-library' и 'third-party'):

```
Декларативный путь (sync, в categorizer):
  7. packageName/source матчит transitiveRules[].package
     → добавить transitiveDS = { dsName: rule.backedBy, coverage: rule.coverage ?? 1.0, source: 'declared' }
     ⚠️ rule.backedBy должен совпадать с именем из config.designSystems — иначе игнорируется

Авто-детекция (async, только local-library с resolvedPath):
  8. Если transitiveAdoption.enabled && нет уже установленного transitiveDS
     → парсим resolvedPath-файл, ищем импорты из config.designSystems[].packages
     → если найден DS-импорт: transitiveDS = { dsName, coverage: 1.0, source: 'auto-detected' }
     → результат кешируется по resolvedPath (один раз на файл)
```

**Пример матчинга по DS**:
```typescript
function findDesignSystem(source: string, config: DSScannerConfig): string | null {
  for (const ds of config.designSystems) {
    const matches = ds.packages.some(pkg =>
      source === pkg ||
      source.startsWith(pkg.replace('/*', '/')) ||
      (pkg.endsWith('/*') && source.startsWith(pkg.slice(0, -2)))
    );
    if (matches) return ds.name;  // "TUI", "Beaver", etc.
  }
  return null;
}
```

### Stage 5: Aggregation & Metrics (`calculator.ts`, `aggregator.ts`)

**Основная формула adoption**:

```
total_DS = sum(instances) по всем designSystems
adoption_rate = total_DS / (total_DS + local_library_instances + local_instances) × 100
```

Per-DS adoption (какую долю занимает конкретная DS):
```
ds_adoption["TUI"] = TUI_instances / (total_DS + local_library + local) × 100
ds_adoption["Beaver"] = Beaver_instances / (total_DS + local_library + local) × 100
```

⚠️ HTML native и third-party **исключены** из формулы. Third-party — это инфраструктура (react-router, formik), а не UI-решения, которые DS мог бы заменить.

⚠️ Сумма `ds_adoption["TUI"]` + `ds_adoption["Beaver"]` + local_library_share + local_share = 100%

**Транзитивная формула (effectiveAdoptionRate)**:

```
transitive_weighted = Σ transitiveDS.coverage  для всех usages с transitiveDS
transitive_third_party_count = count(third-party usages с transitiveDS)

effective_denominator = total_DS + local_library + local + transitive_third_party_count
effective_adoption_rate = (total_DS + transitive_weighted) / effective_denominator × 100
```

Логика знаменателя:
- `local-library` с transitiveDS уже входит в знаменатель (как local_library) → не дублируем
- `third-party` с transitiveDS ранее был excluded → добавляем в знаменатель (это был DS-выбор)
- `third-party` без transitiveDS → по-прежнему excluded

```
Per-DS effective adoption:
ds_effective["TUI"] = (TUI_direct + TUI_transitive_weighted) / effective_denominator × 100
```

**Дополнительные метрики**:

```typescript
interface ScanMetrics {
  // Прямой adoption (только явные DS-импорты, формула не изменилась)
  adoptionRate: number;          // % от 0 до 100

  // Эффективный adoption (с учётом транзитивных)
  effectiveAdoptionRate: number; // % от 0 до 100 (>= adoptionRate)

  // Транзитивная статистика
  transitiveDS: {
    totalInstances: number;      // кол-во usages с transitiveDS-аннотацией
    weightedInstances: number;   // сумма coverage (для дробных правил)
    byDS: {
      name: string;
      instances: number;
      weightedInstances: number;
    }[];
  };

  // Breakdown по каждой DS отдельно
  designSystems: DesignSystemMetrics[];

  // Суммарный breakdown по категориям
  designSystemTotal: CategoryMetrics;   // Сумма всех DS
  localLibrary: CategoryMetrics;
  local: CategoryMetrics;
  thirdParty: CategoryMetrics;
  htmlNative: CategoryMetrics;

  // Дополнительные
  filePenetration: number;       // % файлов с хотя бы одним DS-импортом
  totalComponentInstances: number; // Общее кол-во JSX (без HTML)
  filesScanned: number;
}

// Метрики одной конкретной дизайн-системы
interface DesignSystemMetrics {
  name: string;                  // "TUI", "Beaver"
  packages: string[];            // Пакеты этой DS (из конфига)
  adoptionRate: number;          // Прямая доля ЭТОЙ DS в общем adoption
  effectiveAdoptionRate: number; // С учётом транзитивных
  instances: number;             // Прямые использования
  transitiveInstances: number;   // Транзитивные usages (local-lib/third-party → этот DS)
  transitiveWeighted: number;    // Взвешенная сумма транзитивных (coverage)
  uniqueComponents: number;
  topComponents: ComponentStat[];
  filePenetration: number;       // % файлов с импортом из ЭТОЙ DS
}

interface CategoryMetrics {
  instances: number;             // Общее кол-во JSX usage
  uniqueComponents: number;      // Кол-во уникальных имён компонентов
  topComponents: ComponentStat[]; // Топ-10 по использованию
}

interface ComponentStat {
  name: string;
  dsName: string | null;         // К какой DS относится (null для не-DS)
  packageName: string | null;
  instances: number;
  filesUsedIn: number;
  topProps: { name: string; count: number }[];
}
```

**Формулы**:

Суммарный adoption (все DS вместе):
```
total_ds = сумма instances по всем designSystems
adoption_rate = total_ds / (total_ds + local_library + local) × 100
```

Per-DS adoption (доля конкретной DS):
```
ds_adoption[i] = designSystems[i].instances / (total_ds + local_library + local) × 100
```

⚠️ Сумма всех `ds_adoption[i]` + local_library_share + local_share = 100%.
Каждая DS получает свою "долю пирога".

---

## 🤖 AI Layer — Статические инструкции для агента

### Философия

Сканер **только считает цифры**. AI-инструкции — это обычные `.md` файлы,
которые пишутся один раз при разработке тулзы и лежат в пакете.
Пользователь сам решает когда запустить агента и что спросить.

Никакой генерации, никаких API-вызовов, никаких apply-команд.

### Флоу

```
1. Пользователь: ds-scanner analyze --output .ds-metrics/report.json
   → Получает отчёт с цифрами + подсказку в терминале

2. CLI выводит в конце:
   ──────────────────────────────────────────────────
   🤖 AI-инструкции доступны в node_modules/ds-scanner/ai-instructions/
      • shadow-detection.md  — найти дубликаты DS-компонентов в локальном коде
      • categorization.md    — уточнить категоризацию неоднозначных компонентов
      • report.md            — сгенерировать аналитический отчёт

   Пример: открой Cursor/Claude Code в корне проекта и спроси:
   "Прочитай node_modules/ds-scanner/ai-instructions/shadow-detection.md
    и .ds-metrics/report.json, проанализируй мои локальные компоненты"
   ──────────────────────────────────────────────────

3. Пользователь открывает своего агента (Cursor, Claude Code, чат, что угодно)
4. Задаёт вопрос, ссылаясь на нужную инструкцию + результат скана
5. Агент читает инструкцию, читает JSON, анализирует код, отвечает
```

### Структура в пакете

Инструкции поставляются как часть npm-пакета:

```
ds-scanner/
├── src/
│   └── ...
├── ai-instructions/                    # Статические файлы, часть пакета
│   ├── README.md                       # Обзор доступных инструкций
│   ├── shadow-detection.md             # Поиск дубликатов DS-компонентов
│   ├── categorization.md               # Уточнение категоризации
│   └── report.md                       # Генерация аналитического отчёта
└── package.json                        # files: ["dist", "ai-instructions"]
```

При установке через npm они оказываются в `node_modules/ds-scanner/ai-instructions/`.
CLI выводит полный путь к ним в конце каждого скана.

---

### Файл: `ai-instructions/README.md`

```markdown
# DS Adoption Scanner — AI Instructions

Эти инструкции помогают AI-агентам (Claude Code, Cursor, Aider, ChatGPT и др.)
анализировать результаты сканирования дизайн-системы.

## Доступные инструкции

| Файл | Описание | Когда использовать |
|------|----------|--------------------|
| shadow-detection.md | Поиск локальных компонентов, дублирующих DS | Хочешь найти кандидатов на миграцию в DS |
| categorization.md | Уточнение категоризации компонентов | Сканер некорректно определил категорию |
| report.md | Аналитический отчёт с рекомендациями | Нужен саммари для команды/стейкхолдеров |

## Как использовать

1. Запусти сканер: `ds-scanner analyze --output .ds-metrics/report.json`
2. Открой агента (Cursor, Claude Code, и т.д.) в корне проекта
3. Дай ему инструкцию, например:

> Прочитай файл [путь к инструкции]. Результат скана лежит в .ds-metrics/report.json.
> [Твой конкретный вопрос]

Агент прочитает инструкцию, поймёт формат данных и структуру проекта,
и выполнит анализ с учётом контекста.
```

---

### Файл: `ai-instructions/shadow-detection.md`

```markdown
# Shadow Component Detection

## Твоя роль
Ты анализируешь React-кодовую базу для поиска "теневых" компонентов —
локальных компонентов, которые дублируют или оборачивают компоненты
из дизайн-системы (DS).

## Контекст

Пользователь запустил ds-scanner, результат лежит в JSON-файле.
В JSON есть поля:
- `summary.designSystems[]` — список DS с их компонентами
- `byComponent.designSystems[]` — компоненты каждой DS
- `byComponent.localMostUsed[]` — самые используемые локальные компоненты

## Что делать

1. Прочитай JSON-отчёт, найди `byComponent.localMostUsed` — это кандидаты на анализ
2. Для каждого кандидата (начни с самых используемых):
   a. Найди файл-определение компонента в кодовой базе (поле `source` / `resolvedPath`)
   b. Прочитай его исходный код
   c. Сравни с DS-компонентами из `byComponent.designSystems`
3. Определи: это дубликат/обёртка DS-компонента или уникальный компонент?

## Критерии "дубликата"
- ✅ Рендерит DS-компонент и пробрасывает пропсы (тонкая обёртка)
- ✅ Повторяет функциональность DS-компонента с минимальными отличиями
- ✅ Добавляет только стилизацию поверх DS-компонента
- ❌ НЕ дубликат: содержит существенную бизнес-логику
- ❌ НЕ дубликат: композиция нескольких DS-компонентов с кастомной логикой

## Формат ответа

Для каждого проанализированного компонента сообщи:
- Имя компонента и где он определён
- Дубликат ли (да/нет)
- Если да: какой DS-компонент дублирует и из какой DS (например "TUI.Button")
- Сложность миграции: easy / medium / hard
- Что мешает прямому использованию DS-компонента
- Сколько раз используется (instances из отчёта) — это приоритет миграции

В конце дай summary:
- Сколько дубликатов найдено
- Сколько instances можно мигрировать
- Пересчитанный adoption rate если все easy-дубликаты мигрировать
```

---

### Файл: `ai-instructions/categorization.md`

```markdown
# Component Categorization Helper

## Твоя роль
Ты помогаешь уточнить категоризацию React-компонентов, которые
AST-сканер мог определить неточно.

## Контекст

Сканер категоризирует компоненты по правилам:
1. Lowercase name → `html-native` (div, span)
2. Import из пакетов в `designSystems[].packages` → `design-system`
3. Import матчит `localLibraryPatterns` → `local-library`
4. Прочие npm-пакеты → `third-party`
5. Всё остальное → `local`

Бывают неоднозначные случаи:
- Реэкспорты DS-компонентов через нестандартные пути
- Компоненты из внутренних пакетов, которые по сути DS
- Shared-компоненты, которые сканер пометил как `local`

## Что делать

1. Прочитай JSON-отчёт
2. Посмотри секцию `byComponent.localMostUsed` — компоненты с category `local`
3. Если видишь подозрительные паттерны (имена/пути похожи на DS), проверь:
   - Откуда импортируется (importSource)
   - Где определён (resolvedPath)
   - Есть ли в исходнике реэкспорт из DS-пакета
4. Предложи корректную категорию и объясни почему

## Формат ответа

Список компонентов с предложенными изменениями:
- Имя компонента
- Текущая категория
- Предложенная категория (и какая DS, если design-system)
- Обоснование
- Какой паттерн добавить в конфиг `.ds-scanner.config.ts`
  для автоматического распознавания в будущем
```

---

### Файл: `ai-instructions/report.md`

```markdown
# DS Adoption Analytical Report

## Твоя роль
Ты аналитик дизайн-системы. Напиши краткий actionable отчёт
по результатам сканирования.

## Контекст

Прочитай JSON-отчёт сканирования. Ключевые секции:
- `summary` — общие метрики adoption
- `summary.designSystems[]` — adoption по каждой DS
- `byRepository[]` — breakdown по репозиториям
- `byComponent` — usage по компонентам

## Что включить в отчёт

1. **Общая оценка** (1-2 предложения)
   Здоров ли adoption? Ориентиры: >60% Year 1 — хорошо, >80% — mature

2. **Breakdown по DS**
   Как используется каждая DS? Где сильнее/слабее?

3. **Ключевые находки** (3-5 пунктов)
   Конкретные выводы из данных, не общие фразы

4. **Репозитории-аутсайдеры**
   Кто отстаёт и почему (много local компонентов? какие именно?)

5. **Quick wins**
   Что можно улучшить быстро с максимальным impact на adoption

6. **Приоритетные действия**
   Что команде делать в первую очередь (ранжируй по impact)

## Тон и формат
- Markdown
- Для техлида / PM дизайн-системы
- Цифры > эмоции
- Конкретные actions > абстрактные рекомендации
- Кратко. Не больше 1 страницы
```

---

### Что делает CLI (подсказка в конце вывода)

После вывода таблицы с метриками, CLI всегда печатает подсказку:

```typescript
function printAIHint(config: DSScannerConfig, reportPath: string): void {
  const aiDir = path.resolve(
    require.resolve('ds-scanner/package.json'),
    '../ai-instructions'
  );

  console.log(chalk.dim('──────────────────────────────────────────────────'));
  console.log(chalk.bold('🤖 AI-анализ'));
  console.log(chalk.dim(`   Инструкции: ${aiDir}/`));
  console.log(`   • ${chalk.cyan('shadow-detection.md')}  — найти дубликаты DS в локальном коде`);
  console.log(`   • ${chalk.cyan('categorization.md')}    — уточнить категоризацию компонентов`);
  console.log(`   • ${chalk.cyan('report.md')}            — аналитический отчёт с рекомендациями`);
  console.log('');
  console.log(chalk.dim('   Пример (Cursor / Claude Code):'));
  console.log(chalk.white(`   "Прочитай ${aiDir}/shadow-detection.md`));
  console.log(chalk.white(`    и ${reportPath}, проанализируй локальные компоненты"`));
  console.log(chalk.dim('──────────────────────────────────────────────────'));
}
```

---

### Почему это работает

1. **Нулевой overhead** — инструкции написаны один раз, не генерируются, не требуют конфигурации
2. **Агент-агностик** — Cursor, Claude Code, Aider, ChatGPT, хоть Copilot Chat — всё работает
3. **Контекст** — агент и так видит файлы проекта (в Cursor/Claude Code), ему не нужны копии исходников — он сам найдёт файл по пути из JSON
4. **Гибкость** — пользователь может задать ЛЮБОЙ вопрос, не ограничен тремя "заданиями". Инструкции — это подсказки формата данных, а не жёсткие задания
5. **Кастомизация** — можно скопировать `ai-instructions/` в проект и допилить под себя

---

## 💻 CLI Interface

### Команды

```bash
# Основная команда — запуск скана
ds-scanner analyze [options]

# Показать текущий конфиг (для дебага)
ds-scanner config [--path ./ds-scanner.config.ts]

# Сравнить два скана
ds-scanner compare <baseline.json> <current.json>

# Инициализировать конфиг в проекте
ds-scanner init
```

### Флаги для `analyze`

```
--config, -c <path>        Путь к конфигу (default: .ds-scanner.config.ts)
--format, -f <format>      Формат вывода: table | json | csv (default: table)
--output, -o <path>        Сохранить отчёт в файл
--verbose, -v              Подробный вывод (per-file breakdown)
--min-adoption <number>    CI: exit code 1 если adoption ниже порога
--compare <path>           Сравнить с предыдущим сканом
--save-history             Сохранить результат в historyDir
```

### Exit codes

```
0 — Скан успешен, пороги пройдены (или не заданы)
1 — Adoption rate ниже --min-adoption порога
2 — Ошибка конфигурации
3 — Критическая ошибка сканирования
```

---

## 📊 Формат вывода

### JSON (каноничный формат)

```typescript
interface ScanReport {
  meta: {
    version: string;
    timestamp: string;              // ISO 8601
    scanDurationMs: number;
    configPath: string;
    filesScanned: number;
    repositoriesScanned: number;
    designSystemsConfigured: string[];  // ["TUI", "Beaver"]
  };

  summary: {
    adoptionRate: number;           // Прямой (только явные DS-импорты)
    effectiveAdoptionRate: number;  // С учётом транзитивного адопшена
    totalComponentInstances: number;
    filePenetration: number;

    // Per-DS breakdown
    designSystems: {
      name: string;
      adoptionRate: number;          // Прямая доля этой DS
      effectiveAdoptionRate: number; // С учётом транзитивных
      instances: number;
      transitiveInstances: number;
      uniqueComponents: number;
      filePenetration: number;
    }[];

    // Суммарные категории
    designSystemTotal: CategoryMetrics;
    localLibrary: CategoryMetrics;
    local: CategoryMetrics;
    thirdParty: CategoryMetrics;
    htmlNative: CategoryMetrics;
  };

  byRepository: RepositoryReport[];

  byComponent: {
    // Компоненты сгруппированы по DS
    designSystems: {
      name: string;                 // "TUI"
      components: ComponentStat[];
    }[];
    localMostUsed: ComponentStat[];
    thirdParty: ComponentStat[];
  };

  // Анализ переиспользования локальных компонентов
  // Идентичность по resolvedPath: один исходный файл = один компонент
  localReuseAnalysis: {
    totalTracked: number;           // Уникальных resolvedPath среди 'local'
    inlineCount: number;            // resolvedPath==null (определены в том же файле)
    singletonCount: number;         // filesUsedIn === 1 (page-specific, не кандидаты)
    localReuseCount: number;        // filesUsedIn >= 2, reposUsedIn === 1
    crossRepoCount: number;         // reposUsedIn >= 2 (сильнейший сигнал для DS-миграции)
    topCandidates: {
      componentName: string;
      resolvedPath: string;
      instances: number;
      filesUsedIn: number;
      reposUsedIn: number;
    }[];                            // Топ-20, сортировка: reposUsedIn desc → filesUsedIn desc
  };

  // Сравнение с предыдущим сканом (если --compare)
  comparison?: {
    baselineDate: string;
    adoptionDelta: number;          // +2.3 или -1.1
    byDesignSystem: {
      name: string;
      adoptionDelta: number;
    }[];
    byRepository: {
      name: string;
      adoptionDelta: number;
      trend: 'up' | 'down' | 'stable';
    }[];
    newComponents: string[];
    removedComponents: string[];
  };
}

interface RepositoryReport {
  name: string;
  path: string;
  adoptionRate: number;             // Прямой суммарный
  effectiveAdoptionRate: number;    // С учётом транзитивного адопшена
  filesScanned: number;
  // Per-DS в рамках этого репо
  designSystems: {
    name: string;
    adoptionRate: number;
    effectiveAdoptionRate: number;
    instances: number;
    transitiveInstances: number;
    uniqueComponents: number;
  }[];
  designSystemTotal: CategoryMetrics;
  localLibrary: CategoryMetrics;
  local: CategoryMetrics;
  thirdParty: CategoryMetrics;
  htmlNative: CategoryMetrics;
}
```

### Table (human-readable)

При `--format table` выводить в терминал:

```
╔══════════════════════════════════════════════════════╗
║     DS Adoption Report · 2026-02-26 · 12 repos      ║
╠══════════════════════════════════════════════════════╣

  📊 Direct DS Adoption:    67.4%  ████████████████████░░░░░░░░░░
  📊 Effective Adoption:    74.1%  ██████████████████████░░░░░░░░  (+6.7% via transitive)
      └─ transitive: 87 usages (74.2 weighted) attributed to DS

  📐 Per Design System
  ──────────────────────────────────────────────────────────────────
  DS Name        Direct%   Effective%   Instances   +Transitive   Files
  ──────────────────────────────────────────────────────────────────
  TUI              41.2%      47.8%       5,131         +62        67%
  Beaver           26.2%      26.3%       3,263         +12        48%
  ──────────────────────────────────────────────────────────────────
  All DS total     67.4%      74.1%       8,394         +74        73%

  📦 Full Category Breakdown
  ─────────────────────────────────────────────────
  Category            Instances    Unique    Share
  ─────────────────────────────────────────────────
  ├ TUI                 5,131       32      41.2%
  ├ Beaver              3,263       15      26.2%
  Local Library         1,203       23       9.7%
  Local/Custom          2,853      156      22.9%
  ─────────────────────────────────────────────────
  (Third-party          3,201       34      excluded)
  (HTML native         28,403       42      excluded)

  📦 Repository × DS Breakdown       TUI     Beaver   Total   Local
  ──────────────────────────────────────────────────────────────────
  checkout-frontend                  52.3%    29.8%   82.1%   17.9%
  dashboard-app                      38.1%    33.2%   71.3%   28.7%
  admin-portal                       45.6%    12.8%   58.4%   41.6%
  legacy-storefront                  31.0%     3.2%   34.2%   65.8%

  🏆 Top Components per DS
  ─────────────────────────────────────────────────
  TUI:
    Button                            847       203
    Text                              634       189
    Input                             412       156
  Beaver:
    PageLayout                        342       128
    FormSection                       287        95
    DataTable                         198        67

  ─────────────────────────────────────────────────
  🤖 AI-инструкции: node_modules/ds-scanner/ai-instructions/
     shadow-detection.md | categorization.md | report.md

  ⏱  Scanned 1,847 files in 4.5s
```

Цвета через `chalk`:
- 🟢 Зелёный: adoption > 70%
- 🟡 Жёлтый: 40-70%
- 🔴 Красный: < 40%

---

## ⚡ Performance

### Параллелизация

- **Между репозиториями**: последовательно (один TS resolver per repo, экономим память)
- **Внутри репозитория**: файлы парсятся параллельно через `Promise.all` с concurrency limit (8-16)

### Кэширование

Для повторных сканов:

1. Для каждого файла вычислять SHA-256 хэш содержимого
2. Хранить кэш в `${historyDir}/.cache/file-hashes.json`:
   ```json
   {
     "/repo/src/App.tsx": {
       "hash": "abc123...",
       "result": { /* FileParseResult */ }
     }
   }
   ```
3. При повторном скане: если хэш совпадает → пропустить парсинг, использовать кэш
4. Инвалидация: при изменении конфига — полный ресканинг

### Ожидаемая производительность

- Парсинг одного файла: 10-30ms
- Резолв одного импорта: 1-5ms (с кэшем)
- Типичный репозиторий (500 файлов): 10-20 секунд
- 10 репозиториев: 2-3 минуты (без AI)
- С AI: +1-2 минуты

---

## 🔄 History & CI

### Хранение истории

Каждый скан при `--save-history` сохраняется в `historyDir`:

```
.ds-metrics/
├── .cache/
│   └── file-hashes.json
├── scans/
│   ├── 2026-02-24T14-30-00.json
│   ├── 2026-02-25T14-30-00.json
│   └── 2026-02-26T14-30-00.json
└── manifest.json
```

`manifest.json` — индекс для быстрого доступа:
```json
{
  "scans": [
    { "date": "2026-02-26T14:30:00Z", "adoptionRate": 67.4, "file": "scans/2026-02-26T14-30-00.json" },
    { "date": "2026-02-25T14:30:00Z", "adoptionRate": 66.8, "file": "scans/2026-02-25T14-30-00.json" }
  ],
  "latestScan": "scans/2026-02-26T14-30-00.json"
}
```

### GitLab CI интеграция

```yaml
ds-adoption-scan:
  stage: metrics
  image: node:18
  script:
    - npx ds-adoption-scanner analyze
      --config .ds-scanner.config.ts
      --format json
      --output .ds-metrics/scans/$(date +%Y-%m-%dT%H-%M-%S).json
      --save-history
      --min-adoption 60
  artifacts:
    paths:
      - .ds-metrics/
    expire_in: 1 year
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
    - if: $CI_MERGE_REQUEST_IID
```

---

## 🧪 Тестирование

### Структура тестов

```
tests/
├── unit/
│   ├── parser.test.ts            # Парсинг отдельных файлов
│   ├── categorizer.test.ts       # Правила категоризации
│   ├── calculator.test.ts        # Расчёт метрик
│   └── import-resolver.test.ts   # Резолв импортов
├── fixtures/
│   ├── simple-repo/              # Минимальный тестовый репозиторий
│   ├── barrel-exports/           # Тест barrel files
│   ├── namespace-imports/        # Тест namespace imports
│   ├── aliased-paths/            # Тест tsconfig paths
│   └── mixed-categories/         # Тест всех категорий
└── integration/
    └── full-scan.test.ts         # E2E тест полного сканирования
```

### Фикстуры

Создать минимальные репозитории-фикстуры с известным составом компонентов:

```typescript
// fixtures/simple-repo/src/App.tsx
import { Button, Input } from '@tui/components';        // DS (TUI): 2
import { PageLayout } from 'beaver-ui';                  // DS (Beaver): 1
import { SharedLayout } from '@shared/components';       // Local library: 1
import { CustomCard } from './components/CustomCard';    // Local: 1
import Select from 'react-select';                       // Third-party: 1

export const App = () => (
  <div>                       {/* HTML native */}
    <SharedLayout>
      <PageLayout>
        <CustomCard>
          <Button variant="primary">OK</Button>
          <Input placeholder="..." />
          <Select options={[]} />
        </CustomCard>
      </PageLayout>
    </SharedLayout>
  </div>
);
// Expected: DS(TUI)=2, DS(Beaver)=1, local-library=1, local=1, third-party=1, html=1
// Total DS = 3
// Adoption: 3/(3+1+1) = 60%
// TUI adoption: 2/(3+1+1) = 40%
// Beaver adoption: 1/(3+1+1) = 20%
```

---

## 📋 Порядок реализации (для Claude Code)

### Phase 1: Core Scanner (без AI)
1. `types.ts` — все интерфейсы
2. `config/schema.ts` + `config/defaults.ts` + `config/loader.ts`
3. `scanner/file-discovery.ts`
4. `scanner/parser.ts` + `scanner/jsx-extractor.ts`
5. `scanner/import-resolver.ts`
6. `scanner/categorizer.ts`
7. `metrics/calculator.ts` + `metrics/aggregator.ts`
8. `scanner/orchestrator.ts` — связывает всё вместе
9. `output/json-reporter.ts` + `output/table-reporter.ts`
10. `cli.ts` — entry point

### Phase 2: AI Instructions & History
11. `ai-instructions/*.md` — написать все статические инструкции
12. `metrics/history.ts`
13. `output/csv-reporter.ts`
14. Команда `compare`
15. Команда `init`
16. `package.json` → `"files": ["dist", "ai-instructions"]`

### Phase 3: Tests
17. Unit тесты для parser, categorizer, calculator
18. Фикстуры-репозитории
19. Integration тест

### Phase 4: Transitive Adoption
20. `config/schema.ts` — добавить `TransitiveRule`, `transitiveRules?`, `transitiveAdoption?`
21. `config/loader.ts` — дефолты: `transitiveRules: []`, `transitiveAdoption: { enabled: false }`
22. `types.ts` — `transitiveDS` в `CategorizedUsage`; `effectiveAdoptionRate`/`transitiveDS` в `ScanMetrics`; обновить `DesignSystemMetrics`, `RepositoryReport`, `ScanReport.summary`
23. `scanner/transitive-resolver.ts` (новый) — `enrichWithTransitiveDS()`: авто-детектирование DS в исходниках local-library, кеш по resolvedPath
24. `scanner/categorizer.ts` — declarative `transitiveRules` через `applyTransitiveRule()` (sync)
25. `scanner/orchestrator.ts` — вызов `enrichWithTransitiveDS()` после обработки файлов репо
26. `metrics/calculator.ts` — `effectiveAdoptionRate`, `transitiveDS` в `ScanMetrics` и per-DS
27. `metrics/aggregator.ts` — `effectiveAdoptionRate` в repo-отчётах и summary
28. `output/table-reporter.ts` — вывод Effective Adoption, колонка `Effective%` в per-DS таблице

### Phase 5: Library Pre-Scan (Per-Component DS-Backing)
29. `config/schema.ts` — `LibrarySource` интерфейс (`package`, `backedBy`, `path?`, `git?`, `include?`, `exclude?`); добавить `libraries[]` в `DSScannerConfig`
30. `config/loader.ts` — валидация `libraries[]` (backedBy должен совпадать с DS name, не оба path+git)
31. `scanner/library-prescan.ts` (новый) — `preScanLibraries()`, `parseFileExports()`, `buildComponentMap()`, DFS `resolveFileExports()`; git clone через spawnSync; кеш в `historyDir/.library-cache/`
32. `scanner/transitive-resolver.ts` — Case 0 per-component lookup из LibraryRegistry (приоритет над общими правилами)
33. `scanner/orchestrator.ts` — Stage 0.5: пре-скан библиотек перед основным циклом

### Phase 6: Local Component Reuse Analysis
34. `types.ts` — `LocalReuseGroup`, `LocalReuseReport`, добавить `localReuseAnalysis` в `ScanReport`
35. `metrics/aggregator.ts` — `buildLocalReuseAnalysis()`: группировка local по resolvedPath, три класса (singleton/local-reuse/cross-repo)
36. `output/table-reporter.ts` — секция `♻️ Reuse Opportunities`

### Phase 7: DS Component Family Pre-Scan & Family Coverage Metrics
37. `config/schema.ts` — добавить `path?`, `git?`, `include?`, `exclude?`, `groupBy?` в `DesignSystemDef`; тип `FamilyGroupBy`
38. `config/loader.ts` — валидация path-XOR-git для DS записей
39. `types.ts` — `ComponentFamily`, `DSCatalog`, `FamilyStat`; расширить `CategorizedUsage` (`componentFamily?`), `DesignSystemMetrics` (`totalFamilies?`, `familiesUsed?`, `familyCoverage?`, `topFamilies?`), `ScanReport` (`dsPrescan?`)
40. `scanner/ds-prescan.ts` (новый) — `preScanDesignSystems()`, `buildFamilyCatalog()`, `buildFamilyLookup()`, `groupIntoFamilies()`; переиспользует `parseFileExports()` из library-prescan; группировка по директории с GENERIC_DIRS fallback; только PascalCase value-exports (interfaces/types исключены)
41. `scanner/family-resolver.ts` (новый) — `enrichWithFamily()`: назначает `componentFamily` per DS usage; lookup через `importEntry.importedName` (не localName/componentName — для корректной обработки алиасов)
42. `scanner/library-prescan.ts` — расширить `LibraryComponentEntry` полем `dsFamily?`; `preScanLibraries()` принимает `DSCatalog` и заполняет `dsFamily` для DS-backed компонентов
43. `scanner/orchestrator.ts` — Stage 0 DS prescan (первым); Stage 0.5 library prescan получает DSCatalog; Stage 4.5 family enrichment; передать `dsCatalog` в `aggregateResults`
44. `metrics/calculator.ts` — опциональный `catalog?: DSCatalog` в `calculateMetrics`/`calculatePerDSMetrics`; `buildTopFamilies()`; расчёт `familyCoverage`
45. `metrics/aggregator.ts` — пробросить `dsCatalog` через `aggregateResults` → `buildRepositoryReport` → `buildByComponent`; propagate family fields в отчёт
46. `output/table-reporter.ts` — колонка `Families` в DS-таблице; секция `🎨 Design System Catalog`; секция `🗂️ Top Families per DS`

---

## ⚠️ Важные edge cases для реализации

1. **Файлы без JSX** — парсить, но не фейлить. Просто 0 usages.
2. **Ошибки парсинга** — логировать warning, продолжать скан. Не ронять весь процесс из-за одного битого файла.
3. **Circular re-exports** — при резолве импортов поддерживать visited set чтобы не зациклиться.
4. **Monorepo с workspaces** — каждый workspace как отдельный "репозиторий" в конфиге.
5. **Dynamic imports** (`lazy(() => import('./Page'))`) — НЕ считать как JSX usage. Это import самого модуля, а не использование компонента.
6. **Fragment syntax** (`<>...</>` или `<React.Fragment>`) — НЕ считать как компонент. Это синтаксический сахар.
7. **Forwarded refs** (`React.forwardRef(...)`) — компонент-обёртка, считать как обычный компонент.
8. **Compound components** (`<Select.Option>`) — считать как отдельный компонент "Select.Option", атрибутировать к пакету Select.
9. **CSS-in-JS styled components** (`styled(Button)`) — НЕ анализировать на этом этапе (MVP). Это определение нового компонента, а его использование в JSX будет поймано обычным путём.
10. **JSON output должен быть полным и самодостаточным** — агент (Cursor, Claude Code) будет читать этот файл целиком, поэтому в `byComponent.localMostUsed` обязательно включать `resolvedPath` для каждого компонента, чтобы агент мог найти и прочитать исходники.
11. **Транзитивный адопшен использует только DS из конфига** — `transitiveRule.backedBy` должен совпадать с `designSystems[].name`. Если не совпадает — правило игнорируется с предупреждением.
12. **Авто-детекция только 1 уровень глубины** — не рекурсивно. Если SharedButton.tsx сам импортирует из другой обёртки (не напрямую из DS), авто-детектор не найдёт DS. Рекомендуем declarative rule в таком случае.
13. **Кеш transitive-resolver** — каждый resolvedPath парсится один раз за скан репозитория. Результат кешируется вне зависимости от того, сколько компонентов на него ссылается.
