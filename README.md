# DS Adoption Scanner

CLI-инструмент для измерения adoption дизайн-системы в React/TypeScript проектах. Сканирует JSX-компоненты через AST, категоризирует их по источнику (DS / локальная библиотека / кастомный / third-party / HTML) и считает adoption rate.

```
📊 Direct DS Adoption:   68.6%  █████████████████████░░░░░░░░░
📊 Effective Adoption:   79.7%  ████████████████████████░░░░░░  (+11.1% via transitive)

📐 Per Design System
DS Name       Direct%   Effective%   Instances  +Transitive  Unique  Files w/ DS
Ant Design     68.6%      79.7%          35        +28         26     100.0%
All DS total   68.6%      79.7%          35                    26      77.8%

📦 Category Breakdown
 ├ Ant Design          35        26      68.6%
 Local/Custom          16        12      31.4%
 (Third-party)         63        23      excluded
 (HTML native)         29         6      excluded

🏗️ Repository Breakdown
Repository       Ant Design   Total DS   Effective   Local
ant-design-pro     68.6%       68.6%      79.7%      31.4%

♻️  Reuse Opportunities
312 unique tracked  ·  280 singletons  ·  25 local-reuse  ·  7 cross-repo
(+ 847 inline/anonymous)

Component          Instances   Files   Repos
FormField                45      12       3
DataTable                38       9       2
PageHeader               22       6       2
```

---

## Установка

### Требования

- Node.js >= 18
- npm / pnpm / yarn

### Глобально (рекомендуется для локального использования)

```bash
npm install -g ds-adoption-scanner
ds-scanner --version
```

### Как dev-зависимость проекта

```bash
npm install --save-dev ds-adoption-scanner
npx ds-scanner --version
```

### Сборка из исходников

```bash
git clone <repo-url>
cd ds-adoption-scanner
npm install
npm run build
node dist/cli.cjs --version
```

---

## Быстрый старт

### 1. Создать конфиг

```bash
ds-scanner init
```

Генерирует `.ds-scanner.config.ts` в текущей директории. Открой его и настрой:

```typescript
import { defineConfig } from 'ds-adoption-scanner';

export default defineConfig({
  repositories: [
    '/path/to/your/frontend-repo',
    '/path/to/another-repo',
  ],

  designSystems: [
    {
      name: 'MUI',
      packages: [
        '@mui/material',
        '@mui/lab',
        '@mui/icons-material',
        '@mui/x-date-pickers',
      ],
    },
    {
      name: 'MyDS',
      packages: [
        '@mycompany/ui',
        '@mycompany/icons',
      ],
    },
  ],
});
```

### 2. Запустить сканирование

```bash
ds-scanner analyze
```

### 3. Сохранить отчёт

```bash
ds-scanner analyze --format json --output .ds-metrics/report.json
```

---

## Конфигурация

Полный список параметров файла `.ds-scanner.config.ts`:

```typescript
import { defineConfig } from 'ds-adoption-scanner';

export default defineConfig({
  // ── Обязательные ────────────────────────────────────────────────────────────

  // Пути к репозиториям для сканирования (абсолютные или относительные)
  repositories: [
    '/path/to/repo-1',
    './relative/path/to/repo-2',
  ],

  // Дизайн-системы — ядро конфигурации
  designSystems: [
    {
      name: 'TUI',
      packages: [
        '@tui/components',
        '@tui/icons',
      ],
    },
    {
      name: 'Beaver',
      packages: [
        'beaver-ui',
        'beaver-ui/*',        // wildcard: совпадает с beaver-ui/button, beaver-ui/table и т.д.
      ],
    },
  ],

  // ── Опциональные ─────────────────────────────────────────────────────────────

  // Какие файлы включать (по умолчанию: src/**/*.{ts,tsx,js,jsx})
  include: ['src/**/*.{ts,tsx,js,jsx}'],

  // Какие файлы исключать
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/*.d.ts',
  ],

  // Локальные/shared библиотеки компонентов (не DS, но и не кастомный проект)
  // Матчатся по import specifier И по resolved file path
  localLibraryPatterns: [
    '@shared/components',
    '@shared/components/*',
    '**/shared/ui/**',
    '**/common/components/**',
  ],

  // Путь к tsconfig относительно каждого репозитория (для резолва path aliases)
  tsconfig: 'tsconfig.json',

  // Директория для истории сканов и кэша
  historyDir: './.ds-metrics',

  // Настройки вывода
  output: {
    format: 'table',      // 'table' | 'json' | 'csv'
    path: undefined,      // сохранить в файл
    verbose: false,       // показывать предупреждения парсинга
  },

  // Пороги для CI
  thresholds: {
    minAdoptionRate: 60,  // exit code 1 если adoption ниже
    perDesignSystem: {
      'TUI': { minAdoptionRate: 40 },
    },
  },

  // ── Транзитивный адопшен — точный режим (рекомендуется) ─────────────────────

  // Сканирует исходники библиотеки и определяет DS-backing на уровне компонента.
  // ProTable → coverage 1.0, CustomWidget → 0  — без усреднений.
  //
  // path — путь к исходникам на диске (монорепо, соседний репо)
  // git  — сканер клонирует сам --depth 1, кэш в historyDir/.library-cache/
  libraries: [
    {
      package: '@ant-design/pro-components',
      backedBy: 'Ant Design',
      git: 'https://github.com/ant-design/pro-components',  // автоклон
    },
    {
      package: '@company/shared-ui',
      backedBy: 'TUI',
      path: '../shared-ui',  // локальный путь
    },
  ],

  // ── Транзитивный адопшен — декларативный режим (fallback) ────────────────────

  // Используй если исходники недоступны.
  // Без coverage — сканер проверит package.json в node_modules автоматически.
  // coverage — ручной override (0.0–1.0), применяется ко всем компонентам пакета.
  transitiveRules: [
    {
      package: '@company/legacy-ui',
      backedBy: 'TUI',
      coverage: 0.8,  // ручной override
    },
  ],

  // Включает авто-детект для transitiveRules:
  // - local-library: парсит resolvedPath каждого компонента
  // - third-party: проверяет package.json → DS в deps/peerDeps → coverage 1.0
  transitiveAdoption: {
    enabled: true,
  },

  // ── Знаменатель adoption ──────────────────────────────────────────────────────

  // Исключает Local/Custom компоненты из знаменателя adoption.
  // Полезно, когда уникальные продуктовые компоненты — ожидаемая норма,
  // и нужно измерять только DS vs shared-библиотеки.
  //
  // false (по умолчанию): DS / (DS + local-library + local) × 100
  // true:                 DS / (DS + local-library) × 100
  excludeLocalFromAdoption: false,
});
```

### Формула adoption

**Прямой adoption** (только явные DS-импорты):
```
adoption_rate = DS / (DS + local_library + local) × 100
```

С `excludeLocalFromAdoption: true` — Local/Custom исключаются из знаменателя:
```
adoption_rate = DS / (DS + local_library) × 100
```

**Эффективный adoption** (с учётом транзитивных):
```
transitive_weighted   = Σ coverage_i  для all usages с transitiveDS
effective_denominator = DS + local_library + local + third_party_с_transitiveDS

effective_adoption_rate = (DS + transitive_weighted) / effective_denominator × 100
```

HTML-нативные элементы (`div`, `span`, ...) и third-party пакеты **исключены** из знаменателя прямого adoption — они не являются заменой для DS. Third-party с объявленным `transitiveRules` входит в знаменатель эффективного adoption.

Оба показателя есть в отчёте: `adoptionRate` (прямой, формула не изменилась) и `effectiveAdoptionRate` (новый).

---

## Команды

### `ds-scanner analyze`

Основная команда — запускает полный скан.

```bash
ds-scanner analyze [options]

Опции:
  -c, --config <path>      Путь к конфигу (по умолчанию: .ds-scanner.config.ts)
  -f, --format <format>    Формат вывода: table | json | csv  (по умолчанию: table)
  -o, --output <path>      Сохранить отчёт в файл
  -v, --verbose            Подробный вывод (предупреждения парсинга)
  --min-adoption <number>  CI: exit code 1 если adoption ниже порога
  --compare <path>         Сравнить с предыдущим сканом (JSON-файл)
  --save-history           Сохранить результат в historyDir
```

**Примеры:**

```bash
# Таблица в терминал
ds-scanner analyze

# Сохранить JSON-отчёт
ds-scanner analyze --format json --output .ds-metrics/report.json

# CSV для загрузки в Google Sheets
ds-scanner analyze --format csv --output report.csv

# CI: упасть если adoption ниже 60%
ds-scanner analyze --min-adoption 60

# Сохранить в историю и сравнить с предыдущим сканом
ds-scanner analyze --save-history --compare .ds-metrics/scans/2026-02-25T14-30-00.json

# Подробный вывод (показывать файлы с ошибками парсинга)
ds-scanner analyze --verbose
```

---

### `ds-scanner compare`

Сравнивает два JSON-отчёта и показывает изменения adoption.

```bash
ds-scanner compare <baseline.json> <current.json>
```

**Пример:**

```bash
ds-scanner compare .ds-metrics/scans/2026-02-01.json .ds-metrics/scans/2026-02-26.json
```

Вывод:

```
📈 Comparison with baseline
  Adoption delta: ↑ 4.3%
  MUI: ↑ 4.3%
  New DS components: DataGrid, DatePicker
```

---

### `ds-scanner config`

Показывает итоговую конфигурацию после мёрджа с дефолтами — удобно для дебага.

```bash
ds-scanner config
ds-scanner config --path ./custom-config.ts
```

---

### `ds-scanner init`

Создаёт стартовый `.ds-scanner.config.ts` в текущей директории.

```bash
ds-scanner init
```

---

## Форматы вывода

### `--format table` (по умолчанию)

Читабельный вывод в терминал с цветовой индикацией:

- 🟢 Зелёный: adoption > 70%
- 🟡 Жёлтый: 40–70%
- 🔴 Красный: < 40%

Если есть транзитивный адопшен, выводятся обе строки и расширенные колонки:

```
📊 Direct DS Adoption:   68.6%  █████████████████████░░░░░░░░░
📊 Effective Adoption:   79.7%  ████████████████████████░░░░░░  (+11.1% via transitive)

📐 Per Design System
DS Name       Direct%   Effective%   Instances  +Transitive  Unique  Files w/ DS
Ant Design     68.6%      79.7%          35        +28         26     100.0%

🏗️ Repository Breakdown
Repository       Ant Design   Total DS   Effective   Local
ant-design-pro     68.6%       68.6%      79.7%      31.4%
```

Если транзитивных нет — таблицы компактные, лишних колонок нет.

Если среди `local`-компонентов есть переиспользованные (2+ файла), появляется секция `♻️ Reuse Opportunities` с топ-кандидатами на DS-миграцию, отсортированными по числу репозиториев и файлов.

### `--format json`

Полный машиночитаемый отчёт. Структура:

```jsonc
{
  "meta": { "version": "0.1.0", "filesScanned": 148, ... },
  "summary": {
    "adoptionRate": 41.2,
    "effectiveAdoptionRate": 68.4,       // ← новый: с учётом транзитивных
    "designSystems": [
      {
        "name": "Ant Design",
        "adoptionRate": 41.2,
        "effectiveAdoptionRate": 68.4,   // ← новый
        "instances": 487,
        "transitiveInstances": 312,      // ← новый: через @ant-design/pro-components
        "uniqueComponents": 32,
        "filePenetration": 61.2
      }
    ],
    "localLibrary": { "instances": 0, ... },
    "local": { "instances": 693, ... },
    "thirdParty": { "instances": 312, ... }
  },
  "byRepository": [
    {
      "name": "ant-design-pro",
      "adoptionRate": 41.2,
      "effectiveAdoptionRate": 68.4,     // ← новый
      ...
    }
  ],
  "byComponent": {
    "designSystems": [{ "name": "Ant Design", "components": [...] }],
    "localMostUsed": [
      {
        "name": "AlertBar",
        "instances": 6,
        "resolvedPath": "/path/to/src/components/AlertBar.tsx"
      }
    ],
    "thirdParty": [...]
  },
  "localReuseAnalysis": {
    "totalTracked": 312,
    "inlineCount": 847,
    "singletonCount": 280,
    "localReuseCount": 25,
    "crossRepoCount": 7,
    "topCandidates": [
      {
        "componentName": "FormField",
        "resolvedPath": "/repo/src/components/FormField.tsx",
        "instances": 45,
        "filesUsedIn": 12,
        "reposUsedIn": 3
      }
    ]
  }
}
```

`byComponent.localMostUsed` содержит `resolvedPath` — абсолютный путь к файлу компонента. Это позволяет AI-агентам читать исходник и анализировать его.

`localReuseAnalysis.topCandidates` — список компонентов, используемых в нескольких файлах или репозиториях. Это главные кандидаты на замену DS-компонентами. `resolvedPath` позволяет AI-агенту сразу открыть исходник.

### `--format csv`

Плоская таблица для загрузки в Google Sheets, Excel или BI-инструменты:

```csv
Repository,Adoption Rate,Files Scanned,MUI Adoption,...
cypress-realworld-app,71.1,97,71.1,...

Component,Category,DS Name,Package,Instances,Files Used In
Grid,design-system,MUI,@mui/material,98,19
Typography,design-system,MUI,@mui/material,27,16
AlertBar,local,,,6,6
```

---

## Интеграция с CI

### GitHub Actions

```yaml
- name: DS Adoption Scan
  run: |
    npx ds-adoption-scanner analyze \
      --format json \
      --output .ds-metrics/report-${{ github.sha }}.json \
      --save-history \
      --min-adoption 60
  # exit code 1 если adoption < 60%
```

### GitLab CI

```yaml
ds-adoption-scan:
  stage: metrics
  script:
    - npx ds-adoption-scanner analyze
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

### Exit codes

| Код | Значение |
|-----|----------|
| `0` | Скан успешен, все пороги пройдены |
| `1` | Adoption rate ниже `--min-adoption` порога |
| `2` | Ошибка конфигурации |
| `3` | Критическая ошибка сканирования |

---

## История сканов

При `--save-history` результаты сохраняются в `historyDir` (по умолчанию `.ds-metrics/`):

```
.ds-metrics/
├── scans/
│   ├── 2026-02-24T14-30-00.json
│   ├── 2026-02-25T14-30-00.json
│   └── 2026-02-26T14-30-00.json
├── manifest.json      ← индекс всех сканов
└── .cache/
    └── file-hashes.json
```

Сравнение двух сканов:

```bash
ds-scanner compare .ds-metrics/scans/2026-02-01T00-00-00.json \
                   .ds-metrics/scans/2026-02-26T00-00-00.json
```

---

## AI-инструкции

После каждого скана CLI подсказывает путь к статическим AI-инструкциям:

```
🤖 AI Instructions: node_modules/ds-adoption-scanner/ai-instructions/
   • shadow-detection.md  — найти компоненты, дублирующие DS
   • categorization.md    — уточнить категоризацию
   • report.md            — аналитический отчёт для команды
```

### Как использовать

1. Сохрани отчёт: `ds-scanner analyze --output .ds-metrics/report.json`
2. Открой Cursor, Claude Code или любой другой AI-агент в корне проекта
3. Дай агенту задание:

```
Прочитай node_modules/ds-adoption-scanner/ai-instructions/shadow-detection.md
и .ds-metrics/report.json.
Найди локальные компоненты, которые дублируют MUI-компоненты.
```

Агент прочитает инструкцию (контекст формата данных), JSON-отчёт (цифры),
и сам найдёт исходники компонентов по `resolvedPath`.

### Доступные инструкции

| Файл | Когда использовать |
|------|--------------------|
| `shadow-detection.md` | Хочешь найти компоненты-дубликаты DS для миграции |
| `categorization.md` | Сканер неточно определил категорию компонента |
| `report.md` | Нужен аналитический отчёт для техлида / PM |
| `transitive-adoption.md` | Хочешь понять, какие библиотеки построены на DS и настроить `transitiveRules` |

---

## Как работает сканер

Пайплайн состоит из 5 этапов:

```
1. File Discovery   — fdir обходит репозиторий, picomatch фильтрует по include/exclude
2. Parse & Extract  — @typescript-eslint/typescript-estree строит AST,
                      двухпроходный обход: сначала ImportMap, потом JSXUsageRecord[]
3. Import Resolution — TypeScript API резолвит относительные и aliased импорты,
                       определяет пакеты node_modules. Кэш per-repo.
4. Categorization   — Приоритетные правила: html-native → local → design-system
                       → local-library → third-party → local
5. Metrics          — adoption_rate = DS / (DS + localLib + local) × 100
```

### Категории компонентов

| Категория | Пример | В знаменателе прямого | В знаменателе effective |
|-----------|--------|-----------------------|--------------------------|
| `design-system` | `<Button>` из `@mui/material` | ✅ | ✅ |
| `local-library` | `<SharedHeader>` из `@shared/components` | ✅ | ✅ |
| `local` | `<CustomCard>` из `./components/CustomCard` | ✅ *(или ❌ при `excludeLocalFromAdoption`)* | ✅ *(или ❌)* |
| `third-party` / `local-library` + `libraries[]` (git/path) | `<ProTable>` из `@ant-design/pro-components` | ❌ | ✅ (per-component, точно) |
| `third-party` + `transitiveRule` | `<ProTable>` из `@ant-design/pro-components` | ❌ | ✅ (coverage-based) |
| `third-party` | `<Field>` из `formik` | ❌ | ❌ |
| `html-native` | `<div>`, `<span>` | ❌ | ❌ |

Категория компонента **не изменяется** — `local-library` и `third-party` остаются собой. `transitiveDS` — это аннотация, которая влияет только на `effectiveAdoptionRate`.

**`local` vs `local-library`**: оба — файлы внутри проекта (относительные импорты). Разница задаётся конфигом `localLibraryPatterns`: пути, которые совпадают → `local-library`; всё остальное → `local`. `local-library` участвует в авто-детекции транзитивного адопшена; `local` — нет.

---

## Тестирование на реальном проекте

Идеальный open-source кандидат для проверки сканера — **Ant Design Pro**.

### Почему Ant Design Pro

[ant-design/ant-design-pro](https://github.com/ant-design/ant-design-pro) — эталонное enterprise-приложение на React + TypeScript с 38k⭐. Идеален потому что:

- Использует `antd` как DS **и** `@ant-design/pro-components` как high-level обёртки над antd
- `@ant-design/pro-components` (`ProTable`, `ProForm`, `ProLayout`, ...) — **настоящий кейс транзитивного адопшена**: вся библиотека построена поверх antd
- Смешивает DS-компоненты с кастомными страницами → реалистичный adoption < 100%
- TypeScript, `tsconfig.json`, хорошая структура `src/`

### Быстрый старт

```bash
git clone https://github.com/ant-design/ant-design-pro.git
cd ant-design-pro
```

Создай `.ds-scanner.config.ts` в корне:

```typescript
import { defineConfig } from 'ds-adoption-scanner';

export default defineConfig({
  repositories: ['.'],

  designSystems: [
    {
      name: 'Ant Design',
      packages: ['antd', '@ant-design/icons', 'antd-style'],
    },
  ],

  include: ['src/**/*.{ts,tsx}'],
  exclude: [
    '**/*.test.*', '**/*.spec.*', '**/*.d.ts',
    '**/.umi/**',  // исключить авто-генерированный код (UmiJS)
  ],

  // Pro-Components — high-level обёртки над antd (ProTable, ProForm, ProLayout, ...)
  // libraries.git: сканер клонирует исходники и проверяет каждый компонент отдельно.
  // ProTable → DS-backed (импортирует antd внутри), кастомные утилиты → не считаются.
  libraries: [
    {
      package: '@ant-design/pro-components',
      backedBy: 'Ant Design',
      git: 'https://github.com/ant-design/pro-components',
    },
  ],
});
```

Запусти сканирование:

```bash
node /path/to/dist/cli.cjs analyze --format json --output report.json
```

### Ожидаемый результат

```
📊 Direct DS Adoption:   68.6%  (только явные antd-импорты)
📊 Effective Adoption:   79.7%  (+11.1% via transitive)

Ant Design:
  direct instances=35   transitive=28   unique=26
```

Сканер клонировал исходники `pro-components`, просканировал каждый компонент и обнаружил, что `ProTable`, `ProForm`, `ProLayout` и другие импортируют `antd` напрямую → coverage 1.0 за каждый из 28 инстанций. Компоненты, не использующие `antd` внутри, в счёт не идут.

### Другие кандидаты

| Проект | DS | Для тестирования |
|--------|-----|------------------|
| [react-antd-admin](https://github.com/condorheroblog/react-antd-admin) | `antd` | Простой, один репо, ~150 tsx |
| [Formbricks](https://github.com/formbricks/formbricks) | Radix UI | Monorepo, local-library в `packages/` |
| [Plane](https://github.com/makeplane/plane) | Custom / Tailwind | Крупный monorepo, edge cases |

---

## Разработка

```bash
# Установить зависимости
npm install

# Сборка (ESM + CJS)
npm run build

# Разработка с watch
npm run dev

# Тесты (113 тестов)
npm test
npm run test:unit          # только unit
npm run test:integration   # только integration

# Линтинг
npm run lint
```

### Структура проекта

```
src/
├── cli.ts                     # Entry point, commander
├── types.ts                   # Все TypeScript-типы
├── config/
│   ├── schema.ts              # DSScannerConfig, defineConfig()
│   ├── defaults.ts            # Дефолтные include/exclude
│   └── loader.ts              # Загрузка .ts конфига через jiti
├── scanner/
│   ├── file-discovery.ts      # fdir + picomatch
│   ├── parser.ts              # Парсинг файла через typescript-estree
│   ├── jsx-extractor.ts       # Двухпроходный AST-обход
│   ├── import-resolver.ts     # TypeScript API, кэш per-repo
│   ├── categorizer.ts         # Правила категоризации + declarative transitiveRules
│   ├── library-prescan.ts     # Пре-скан libraries[]: экспорты + DS-детект per-component
│   ├── transitive-resolver.ts # Обогащение usages: registry → auto-scan → declared
│   └── orchestrator.ts        # Оркестрация, concurrency limit 16
├── metrics/
│   ├── calculator.ts          # Adoption formula, per-DS метрики
│   ├── aggregator.ts          # Агрегация по репо → ScanReport
│   └── history.ts             # Сохранение истории, сравнение
└── output/
    ├── json-reporter.ts
    ├── table-reporter.ts      # cli-table3 + chalk
    └── csv-reporter.ts

tests/
├── unit/                      # parser, categorizer, calculator, import-resolver,
│                              # library-prescan, aggregator-reuse
├── integration/               # full-scan.test.ts (runScan() e2e)
└── fixtures/                  # simple-repo, barrel-exports, namespace-imports,
                               # aliased-paths, mixed-categories
ai-instructions/
├── README.md
├── shadow-detection.md
├── categorization.md
├── report.md
└── transitive-adoption.md
```
