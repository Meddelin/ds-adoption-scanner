# DS Adoption Scanner

CLI-инструмент для измерения adoption дизайн-системы в React/TypeScript проектах. Сканирует JSX-компоненты через AST, категоризирует их по источнику (DS / локальная библиотека / кастомный / third-party / HTML) и считает adoption rate.

```
📊 Total DS Adoption:  71.1%  █████████████████████░░░░░░░░░

📐 Per Design System
 MUI              71.1%      323        56     68.1%
 All DS total     71.1%      323        56     48.5%

📦 Category Breakdown
 ├ MUI                  323        56      71.1%
 Local/Custom           131        74      28.9%
 (Third-party)           60        16      excluded
 (HTML native)          307        17      excluded
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
});
```

### Формула adoption

```
adoption_rate = DS_instances / (DS_instances + local_library_instances + local_instances) × 100
```

HTML-нативные элементы (`div`, `span`, ...) и third-party пакеты **исключены** из знаменателя — они не являются заменой для DS.

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

### `--format json`

Полный машиночитаемый отчёт. Структура:

```jsonc
{
  "meta": {
    "version": "0.1.0",
    "timestamp": "2026-02-26T19:53:45.829Z",
    "scanDurationMs": 215,
    "filesScanned": 97,
    "repositoriesScanned": 1,
    "designSystemsConfigured": ["MUI"]
  },
  "summary": {
    "adoptionRate": 71.1,
    "designSystems": [
      { "name": "MUI", "adoptionRate": 71.1, "instances": 323, "uniqueComponents": 56 }
    ],
    "designSystemTotal": { "instances": 323, "uniqueComponents": 56, "topComponents": [...] },
    "local": { "instances": 131, "uniqueComponents": 74, "topComponents": [...] },
    ...
  },
  "byRepository": [...],
  "byComponent": {
    "designSystems": [{ "name": "MUI", "components": [...] }],
    "localMostUsed": [
      {
        "name": "AlertBar",
        "instances": 6,
        "filesUsedIn": 6,
        "resolvedPath": "/path/to/src/components/AlertBar.tsx"
      }
    ],
    "thirdParty": [...]
  }
}
```

`byComponent.localMostUsed` содержит `resolvedPath` — абсолютный путь к файлу компонента. Это позволяет AI-агентам читать исходник и анализировать его.

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

| Категория | Пример | В знаменателе |
|-----------|--------|---------------|
| `design-system` | `<Button>` из `@mui/material` | ✅ да |
| `local-library` | `<SharedHeader>` из `@shared/components` | ✅ да |
| `local` | `<CustomCard>` из `./components/CustomCard` | ✅ да |
| `third-party` | `<Field>` из `formik` | ❌ нет |
| `html-native` | `<div>`, `<span>` | ❌ нет |

---

## Разработка

```bash
# Установить зависимости
npm install

# Сборка (ESM + CJS)
npm run build

# Разработка с watch
npm run dev

# Тесты (85 тестов)
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
│   ├── categorizer.ts         # Правила категоризации
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
├── unit/                      # parser, categorizer, calculator, import-resolver
├── integration/               # full-scan.test.ts (runScan() e2e)
└── fixtures/                  # simple-repo, barrel-exports, namespace-imports,
                               # aliased-paths, mixed-categories
ai-instructions/
├── README.md
├── shadow-detection.md
├── categorization.md
└── report.md
```
