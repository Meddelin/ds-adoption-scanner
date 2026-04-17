# DS Adoption Scanner

CLI-инструмент для измерения adoption дизайн-системы в React/TypeScript проектах. Сканирует JSX-компоненты через AST, категоризирует их по источнику (DS / локальная библиотека / кастомный / third-party / HTML) и считает adoption rate.

> **v2.0 Update**: Новая deterministic analytical модель с route-level метриками и shadow usage detection. См. [Deterministic Model](#deterministic-analytical-model-v2).

```
📊 Direct DS Adoption:         68.6%  (exact)
📊 Effective Adoption Proxy:   79.7%  (+11.1% via transitive, proxy)
📊 Shadow Usage Proxy:         15.2%  (parallel UI layer)

📐 Per Design System
DS Name       Direct%   Effective%   Direct Inst.   Transitive Inst.   Unique
Ant Design     68.6%      79.7%            35               +28           26
All DS total   68.6%      79.7%            35               +28           26

🗂️ Top Families per DS — Ant Design
Family       Components   Instances   Files   Repos
Button              2           18       8       2
Form                5           12       6       1
Table               3            5       4       2

📦 Category Breakdown
 ├ Ant Design             35        26      68.6%
 Local Library             8         5       —
   ↳ Transitive (DS-backed) 8        5       —
   ↳ Custom                 0        0       —
 Reusable Custom            6         4      —

🗂️ Local Component Families
Family       Components   Instances   Files
containers        3           12       8
AlertBar          1            6       6
PageHeader        1            4       4

🏗️ Repository Breakdown
Repository       Direct Adoption   Effective Adoption   Local
ant-design-pro         68.6%              79.7%         31.4%
```

---

## Deterministic Analytical Model (v2.0)

Новая версия сканера поддерживает детерминированную аналитическую модель с явным разделением exact/proxy метрик:

### Analytical Buckets (взаимоисключающие)

| Bucket | Описание | Примеры |
|--------|----------|---------|
| **Adoption** | Подтвержденное использование DS | Прямые DS компоненты, DS-backed обёртки |
| **Shadow** | Параллельный локальный UI-слой | Reusable local компоненты, UI families |
| **Neither** | Utility/business слой | Data fetchers, providers, thin wrappers |

### Метрики

| Метрика | Тип | Формула | Назначение |
|---------|-----|---------|------------|
| **Direct Adoption** | Exact | DS / (A+S+N) × 100 | Надёжный lower bound |
| **Effective Adoption Proxy** | Proxy | (DS + Weighted Wrappers) / (A+S+N) × 100 | Расширенная structural метрика |
| **Shadow Usage Proxy** | Proxy | Shadow / (A+S+N) × 100 | Сигнал параллельного UI |

*A+S+N = Adoption + Shadow + Neither (исключая HTML native)*

### Route-Level Аналитика

Сканер теперь поддерживает route-level агрегацию:
- **React Router v6** — обнаружение `createBrowserRouter` / `createHashRouter` / `<Routes>` конфигов
- **Next.js** — pages/ и app/ директории
- Fallback directory-based resolution
- Confidence markers (high / medium / low) для всех маппингов
- Resolver badge в HTML-отчёте (React Router / Next.js / Path / Directory)
- Фильтрация по резолверу в Routes-вкладке

### Shadow Usage Detection (Deterministic)

Только rule-based сигналы (NO AI, NO embeddings):

| Сигнал | Обнаружение | Сила |
|--------|-------------|------|
| `reusable-local` | Используется в ≥ N файлах | Strong |
| `multi-route` | Используется в ≥ M роутах | Strong |
| `ui-family` | Часть UI family pattern | Moderate |
| `substantial-markup` | > X JSX элементов | Moderate |
| `parallel-layer` | Формирует consistent UI layer | Moderate |
| `primitive-like` | Имя совпадает с primitive pattern | Weak |

### API (Programmatic)

```typescript
import { 
  AnalyticalClassifier, 
  createClassificationContext,
  RouteResolutionOrchestrator,
  calculateMetricsV2 
} from 'ds-adoption-scanner';

// Route resolution
const routeResolver = new RouteResolutionOrchestrator({
  enabled: true,
  enableFallback: true,
});

// Classification
const classifier = new AnalyticalClassifier(
  createClassificationContext(repoPath, designSystems)
);

// V2 metrics
const metrics = calculateMetricsV2(classifiedUsages, profiles, context);
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

### 3. Результат

Каждый запуск `analyze` автоматически выводит:
- Таблицу в терминал
- `ds-report.json` — полный машиночитаемый отчёт
- `ds-report.html` — визуальный отчёт (открывается в браузере)

Задать собственное имя файлов:

```bash
ds-scanner analyze --output .ds-metrics/report
# → .ds-metrics/report.json + .ds-metrics/report.html
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
      // Опционально: пре-скан исходников DS для family coverage метрики
      path: '../tui-design-system/packages/components',  // локальный путь
      // git: 'https://github.com/company/tui-design-system',  // или автоклон
      groupBy: 'directory',  // 'directory' (по умолчанию) | 'none'
      // Алгоритм directory: первый не-generic сегмент пути от корня DS = семья.
      // Button/Button.tsx → "Button"
      // EmptyState/EmptyStateButton/Btn.tsx → "EmptyState"  (вся ветка = одна семья)
      // EmptyState/src/EmptyStateNoData.tsx → "EmptyState"  (src — generic, пропускается)
      // src/components/Button/ButtonGroup.tsx → "Button"    (src, components — generic)
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
    'src/ui-kit/**',        // local DS wrapper kit (barrel re-exports auto-followed)
  ],

  // Путь к tsconfig относительно каждого репозитория (для резолва path aliases)
  tsconfig: 'tsconfig.json',

  // Директория для истории сканов и кэша
  historyDir: './.ds-metrics',

  // Настройки вывода
  output: {
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
  // componentsDir — суб-путь внутри корня, где начинаются семьи компонентов.
  //   Например 'src/components/spirit-ui' → следующий сегмент = имя семьи.
  //   По умолчанию: корень библиотеки (GENERIC_DIRS пропускаются автоматически).
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
    {
      package: '@company/spa-ui',
      backedBy: 'Spirit',
      path: '../spa-ui',
      componentsDir: 'src/components/spirit-ui',  // семьи: confirm-popup, empty-state, …
    },
  ],

  // ── Транзитивный адопшен — декларативный режим (fallback) ────────────────────

  // Используй если исходники недоступны.
  // Без coverage — сканер проверит package.json в node_modules автоматически.
  // coverage — пороговое значение: > 0 (или не задано) = все matching usages
  //            считаются DS-backed (coverage=1.0); 0 = не считать.
  transitiveRules: [
    {
      package: '@company/legacy-ui',
      backedBy: 'TUI',
      // coverage: 0,  // отключить транзитивный вклад для пакета
    },
  ],

  // Включает авто-детект для transitiveRules:
  // - local-library: парсит resolvedPath каждого компонента
  // - third-party: проверяет package.json → DS в deps/peerDeps → coverage 1.0
  transitiveAdoption: {
    enabled: true,
  },

  // ── Знаменатель adoption ──────────────────────────────────────────────────────

  // Исключает все Local/Custom компоненты из знаменателя adoption.
  // false (по умолчанию): DS / (DS + local-library + local) × 100
  // true:                 DS / (DS + local-library) × 100
  excludeLocalFromAdoption: false,

  // Исключает только уникальные локальные компоненты (1 файл) из знаменателя.
  // Переиспользуемые (≥ reusableThreshold файлов) остаются в знаменателе.
  //
  // false (по умолчанию): DS / (DS + local-library + localReusable + localUnique) × 100
  // true:                 DS / (DS + local-library + localReusable) × 100
  //
  // Полезно, когда страничные one-off компоненты — ожидаемая норма,
  // но переиспользуемая кастомная логика по-прежнему должна учитываться.
  excludeUniqueLocalFromAdoption: false,

  // Минимальное число файлов, в которых используется компонент, чтобы считаться
  // «переиспользуемым» (reusable). По умолчанию: 2.
  // Влияет на разбивку local/custom → reusable / unique и на метку в отчёте.
  reusableThreshold: 2,
});
```

### Формула adoption

**Прямой adoption** (только явные DS-импорты):
```
adoption_rate = DS / (DS + local_library + localReusable + localUnique) × 100
```

Local/Custom компоненты делятся на два подтипа:
- **localReusable** — используются в ≥ 2 файлах (переиспользуемые компоненты)
- **localUnique** — используются ровно в 1 файле (one-off / страничные)

С `excludeUniqueLocalFromAdoption: true` — уникальные исключаются из знаменателя:
```
adoption_rate = DS / (DS + local_library + localReusable) × 100
```

С `excludeLocalFromAdoption: true` — все Local/Custom исключаются:
```
adoption_rate = DS / (DS + local_library) × 100
```

**Эффективный adoption** (с учётом транзитивных local-library):
```
transitive_local_lib  = count(local-library usages с transitiveDS)
                        (transitive_local_lib ⊂ L — уже входит в denominator)

effective_adoption_rate = (DS + transitive_local_lib) / denominator × 100
```

HTML-нативные элементы (`div`, `span`, ...) и third-party пакеты **исключены** из знаменателя — они не являются заменой для DS. В эффективный adoption входят только `local-library` usages с `transitiveDS` (пакеты из `localLibraryPatterns`, у которых обнаружен DS-backing).

Оба показателя есть в отчёте: `adoptionRate` (прямой, формула не изменилась) и `effectiveAdoptionRate` (новый).

---

## Команды

### `ds-scanner analyze`

Основная команда — запускает полный скан.

```bash
ds-scanner analyze [options]

Опции:
  -c, --config <path>      Путь к конфигу (по умолчанию: .ds-scanner.config.ts)
  -o, --output <path>      Базовое имя выходных файлов (без расширения)
  -v, --verbose            Подробный вывод (предупреждения парсинга)
  --min-adoption <number>  CI: exit code 1 если adoption ниже порога
  --compare <path>         Сравнить с предыдущим сканом (JSON-файл)
  --save-history           Сохранить результат в historyDir
```

Каждый запуск автоматически создаёт **два файла**:
- `ds-report.json` — полный машиночитаемый отчёт
- `ds-report.html` — визуальный отчёт (открыть в браузере)

Таблица всегда выводится в терминал.

**Примеры:**

```bash
# Скан с выводом в терминал + ds-report.json + ds-report.html
ds-scanner analyze

# Задать кастомное имя файлов
ds-scanner analyze --output .ds-metrics/report
# → .ds-metrics/report.json + .ds-metrics/report.html

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

### Терминал (всегда)

Читабельный вывод в терминал с цветовой индикацией:

- 🟢 Зелёный: adoption > 70%
- 🟡 Жёлтый: 40–70%
- 🔴 Красный: < 40%

Если есть транзитивный адопшен, выводятся обе строки и расширенные колонки:

```
📊 Direct DS Adoption:   68.6%  █████████████████████░░░░░░░░░
📊 Effective Adoption:   79.7%  ████████████████████████░░░░░░  (+11.1% via transitive)

📐 Per Design System
DS Name       Direct%   Effective%   Direct Inst.   Transitive Inst.   Unique
Ant Design     68.6%      79.7%            35              +28           26

📦 Category Breakdown
 ├ Ant Design          35        26      68.6%
 Local/Custom          16        12      31.4%
   ├ Reusable (≥2f)     6         4      —
   └ Unique (1 file)   10         8      —

🗂️ Local Component Families
Family       Components   Instances   Files   Repos
containers        3           12       8       1
AlertBar          1            6       6       1

🏗️ Repository Breakdown
Repository       Ant Design   Total DS   Effective   Local
ant-design-pro     68.6%       68.6%      79.7%      31.4%
```

Если транзитивных нет — таблицы компактные, лишних колонок нет.

### JSON (всегда, `ds-report.json`)

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
        "uniqueComponents": 32
      }
    ],
    "localLibrary": { "instances": 0, ... },
    "localReusable": { "instances": 41, ... },   // используются в ≥ 2 файлах
    "localUnique":   { "instances": 90, ... },   // используются ровно в 1 файле
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
    "localTopFamilies": [
      {
        "family": "containers",
        "components": ["AppLayout", "PageWrapper", "SidebarLayout"],
        "instances": 12,
        "filesUsedIn": 8,
        "reposUsedIn": 1
      }
    ],
    "thirdParty": [...]
  }
}
```

`byComponent.localMostUsed` содержит `resolvedPath` — абсолютный путь к файлу компонента. Это позволяет AI-агентам читать исходник и анализировать его.

`byComponent.localTopFamilies` — топ-20 семей локальных компонентов, сгруппированных по директории (аналогично DS-семьям). Семья = первый не-generic сегмент пути от корня компонента (`src`, `components`, `lib`, `ui` — пропускаются).

### HTML (всегда, `ds-report.html`)

Самодостаточный HTML-файл (без внешних зависимостей). Содержит все секции: hero-карточки с adoption rate, разбивку по DS, семьи компонентов, Local Families, разбивку по репозиториям. Можно отправить по почте или открыть офлайн.

### CSV (опционально)

Плоская таблица для загрузки в Google Sheets, Excel или BI-инструменты. Генерируется отдельно через `ds-scanner analyze --output report.csv` (если задано расширение `.csv`).

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
| `local` (reusable) | `<CustomCard>` в ≥ 2 файлах | ✅ *(или ❌ при `excludeLocalFromAdoption`)* | ✅ *(или ❌)* |
| `local` (unique) | `<PageSpecificWidget>` в 1 файле | ✅ *(или ❌ при `excludeUniqueLocalFromAdoption` / `excludeLocalFromAdoption`)* | ✅ *(или ❌)* |
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

# Тесты (158 тестов)
npm test
npm run test:unit          # только unit
npm run test:integration   # только integration

# Линтинг
npm run lint

# Быстрый bootstrap-контекст для AI/разработки
npm run codex:bootstrap
npm run codex:bootstrap -- --with-checks
```

### Структура проекта

```
src/
├── cli.ts                     # Entry point (commander)
├── index.ts                   # Public API
├── types.ts                   # Base TypeScript types
├── config/                    # Config schema & loader
├── domain/                    # Layer 0: Models, Types, Invariants
├── scanner/                   # Layer 1: AST Parser, Resolvers, V2 pipeline orchestrator
├── routes/                    # Layer 2: Next.js / React Router matching
├── classification/            # Layer 3: Deterministic analytical heuristics
├── metrics/                   # Layer 4: Exact/Proxy formulas, Report aggregation
└── output/                    # Layer 5: HTML, CLI table reporters

tests/
├── unit/
├── integration/
└── fixtures/

ai-instructions/
├── README.md
├── shadow-detection.md
├── categorization.md
├── report.md
└── transitive-adoption.md
```

### Контекст для следующих задач

Чтобы не начинать каждый раз с нуля:

1. Запусти `npm run codex:bootstrap`
2. Прочитай `docs/PROJECT_CONTEXT.md` (если есть)
3. Следуй инструкциям в `AGENTS.md`
4. Не забудь запустить тесты (`npm test`)

### Валидация метрик для продуктового аналитика

Подробный гайд по проверке корректности расчётов (термины, формулы, инварианты, чеклист):

- `docs/PRODUCT_ANALYST_VALIDATION_GUIDE.md`
