Ты — senior TypeScript engineer / architect.
Работаешь в репозитории Meddelin/ds-adoption-scanner.

Твоя задача:
не просто добавить новые метрики,
а провести целевой рефакторинг библиотеки и документации так, чтобы она поддерживала новую детерминированную модель продуктовой аналитики Beaver.

Важно:
- README и текущая структура репозитория частично устарели;
- изменения нужно делать вместе с рефакторингом;
- AI / embeddings / LLM-assisted classification сейчас НЕ ДЕЛАТЬ;
- фокус только на deterministic implementation;
- не имитируй универсальность там, где её нет;
- не ломай существующий direct/effective pipeline без причины;
- работай итерационно, маленькими осмысленными коммитами, чтобы к ним было легко откатиться;
- агент обязан создать и дальше поддерживать AGENTS.MD как живую инструкцию по работе с проектом.

Контекст текущей реализации

Сейчас библиотека уже умеет:
- AST parse React/TypeScript кода;
- extract JSX usages;
- resolve imports;
- categorize usages по structural category;
- считать direct adoption и effective adoption.

Факты о текущей модели:
1. В src/metrics/calculator.ts direct adoption сейчас считается как:
   DS / (DS + local-library + local[по config]) * 100

2. Effective adoption сейчас считается как:
   (DS + transitive local-library usages) / тот же denominator
   То есть current effective adoption — это расширенный structural proxy, а не ground-truth adoption.

3. В src/types.ts категории пока такие:
   - design-system
   - local-library
   - third-party
   - local
   - html-native

4. transitiveDS сейчас — это аннотация у usage, а не отдельная финальная продуктовая классификация.

5. Route-level сущностей и route-level aggregation в текущем report model нет.

6. README и часть docs описывают effective adoption слишком “как будто это настоящий adoption”, а новая модель требует явной маркировки proxy-метрик.

Целевая продуктовая модель

Нужно поддержать следующую модель именно детерминированно:

1. Основные аналитические категории:
- Adoption
- Shadow Usage
- Neither

2. Основные измерения:
- Direct Adoption — самый надежный нижний порог использования Beaver;
- Effective Adoption Proxy — текущая расширенная structural метрика через DS-backed local-library / wrappers, но теперь явно proxy;
- Shadow Usage Proxy — детерминированный AST/rule-based сигнал параллельного локального UI;
- Neither — utility / business wrappers / служебный слой, который не должен идти ни в Adoption, ни в Shadow Usage.

3. В итоговой аналитической модели Adoption и Shadow Usage должны быть непересекающимися.
Любой usage / local component / aggregate, который участвует в финальной классификации, должен попадать ровно в одну из buckets:
- Adoption
- Shadow Usage
- Neither

4. Измерение должно поддерживаться на двух уровнях:
- Repository level
- Route level

Главный фокус — route level.

5. Shadow Usage на этом этапе — только deterministic proxy, а не доказанный semantic duplicate.
Никаких AI эвристик, embeddings, “умных” классификаторов и прочего цирка.

Что должно получиться в итоге

После изменений библиотека должна:
- честно разделять exact / lower-bound / proxy метрики;
- уметь считать route-level и repository-level аналитики;
- поддерживать детерминированную классификацию Adoption / Shadow Usage / Neither;
- иметь прозрачную report schema;
- иметь актуальный README;
- иметь понятную внутреннюю структуру кода;
- иметь тесты на новую модель;
- иметь и поддерживать AGENTS.MD;
- быть пригодной для продуктовых решений Beaver:
  - где Beaver реально есть;
  - где рядом живёт локальный UI-слой;
  - какие маршруты приоритетнее;
  - где инвестиция в компонент/миграцию даст больший эффект.

Обязательный способ работы

Работай в такой последовательности:

PHASE 0 — Аудит и план
Сначала изучи текущую реализацию и составь design note.
Ничего большого не переписывай вслепую.

Нужно:
- описать текущую архитектуру;
- указать, какие части устарели;
- явно показать разрыв между текущей моделью и целевой;
- предложить целевую архитектуру;
- предложить план рефакторинга по шагам;
- обозначить риски и trade-offs.

Создай документ:
docs/deterministic-adoption-refactor-plan.md

В документе должны быть:
1. Current state
2. Target analytical model
3. Proposed domain model
4. Proposed route resolution architecture
5. Proposed metric formulas
6. Refactor plan by phases
7. Test strategy
8. Risks / non-goals

PHASE 0.1 — Создать и начать поддерживать AGENTS.MD
Если файла AGENTS.MD нет — создай его.
Если он есть — обнови.

AGENTS.MD должен быть коротким, практичным и постоянно актуальным.
Это не маркетинговая простыня, а рабочая инструкция для следующих агентных итераций.

В AGENTS.MD зафиксируй:
1. Что это за проект
- цель проекта;
- какие задачи он решает;
- на каком уровне сейчас зрелость аналитики.

2. Главные архитектурные слои
- scanner / parsing / extraction;
- route resolution;
- analytical classification;
- metric aggregation;
- reporters / outputs;
- docs / test strategy.

3. Основные доменные понятия
- structural category;
- direct adoption;
- effective adoption proxy;
- shadow usage proxy;
- analytical buckets: adoption / shadow usage / neither;
- repository-level vs route-level metrics.

4. Правила изменений
- сначала design doc, потом крупные изменения;
- маленькие осмысленные коммиты;
- не смешивать unrelated changes;
- не делать AI-логику в этом scope;
- не маскировать ограничения ложной универсальностью.

5. Инварианты
- buckets mutually exclusive;
- no double counting;
- direct adoption <= effective adoption proxy;
- proxy metrics должны быть явно помечены;
- unmapped routes не должны теряться молча.

6. Какой минимальный набор проверок запускать после изменений
- unit / integration / targeted tests;
- typecheck / build;
- что проверять руками в output/report.

7. Как поддерживать AGENTS.MD
После каждого значимого архитектурного или доменного изменения:
- обновить AGENTS.MD;
- убрать устаревшие утверждения;
- синхронизировать его с README и docs;
- не оставлять AGENTS.MD в состоянии “код уже другой”.

AGENTS.MD должен обновляться отдельным маленьким коммитом, если изменения в нём нетривиальны.

PHASE 1 — Рефакторинг доменной модели
Нужно привести типы и внутренние сущности в порядок.

Сделай явное разделение между:
- raw structural categorization
- derived analytical classification
- metric buckets
- proxy vs exact metrics

Если нужно, введи новые типы/слои, например:
- StructuralCategory
- AnalyticalBucket
- ClassificationEvidence
- RouteMatch
- RouteMetrics
- RepositoryMetricsV2
- ScanReportV2
- UsageClassificationResult
- LocalComponentProfile
- ShadowSignal

Но не тащи лишний энтерпрайз-цирк.
Типы должны упрощать понимание, а не плодить мусор.

Требования:
- текущая structural categorization должна остаться;
- поверх неё должна появиться аналитическая модель;
- название Effective Adoption нужно изменить так, чтобы было ясно, что это proxy;
- все названия в JSON/report/README/AGENTS.MD должны быть консистентны.

PHASE 2 — Route-level architecture
Нужно добавить честную route-aware модель.

Требования:
1. Route extraction не нужно делать “магически универсальным”.
   Сделай extensible deterministic architecture.

2. Нужен abstraction layer для route resolution.
   Например:
   - route resolvers / route providers / strategies
   - configurable patterns
   - framework-aware adapters if needed
   - fallback with confidence/provenance marker

3. Система должна уметь:
   - привязывать file/usages/components к route;
   - объяснять, откуда взялся route mapping;
   - агрегировать metrics by route;
   - gracefully работать, если route mapping частично неизвестен.

4. Если exact pathname извлечь нельзя,
   допускается route key / route id / page group / section key,
   но это должно быть честно названо и задокументировано.

5. Не закапывай всё в один giant if-else.
   Route resolution должна быть отдельным слоем со своими интерфейсами и тестами.

PHASE 3 — Deterministic Shadow Usage model
Нужно реализовать только rule-based baseline без AI.

Введи детерминированную модель сигналов Shadow Usage.

Система должна уметь выделять structural candidates в Shadow Usage, например по таким классам признаков:
- reusable local UI components;
- local UI families, используемые в нескольких файлах / маршрутах;
- local wrappers with significant UI markup beyond thin pass-through;
- local components, structurally похожие на UI primitives / composed UI;
- local-library or local components, образующие устойчивый параллельный UI layer;
- локальные компоненты, которые не являются utility / business wrapper и при этом явно участвуют в рендере UI.

Но:
- не пытайся доказать семантический duplicate;
- не придумывай fuzzy scoring ради красоты;
- все правила должны быть deterministic и explainable.

Нужна явная классификация:
- Adoption
- Shadow Usage
- Neither

При этом:
- Direct DS usage -> Adoption
- DS-backed thin wrappers / allowed structural compositions -> adoption-related proxy classification
- utility components / business wrappers -> Neither
- substantial local UI layer -> Shadow Usage Proxy

Если нужен двухступенчатый подход:
- raw signals
- derived bucket

Так и делай. Это лучше, чем каша из enum-ов.

PHASE 4 — Metrics redesign
Пересобери формулы и aggregation model.

Нужно поддержать:
- repository-level metrics
- route-level metrics
- overall summary

Минимально нужны такие метрики:
1. Direct Adoption
   Надежный lower-bound.
   Только явный Beaver usage.

2. Effective Adoption Proxy
   Переименованная/пересмотренная версия текущего effective adoption.
   Должно быть ясно, что это proxy, а не factual adoption.

3. Shadow Usage Proxy
   Детерминированный сигнал параллельного локального UI-слоя.

4. Final bucket breakdown
   Доли / counts / instances / files / routes для:
   - Adoption
   - Shadow Usage
   - Neither

5. Route breakdown
   Для каждого route:
   - direct adoption
   - effective adoption proxy
   - shadow usage proxy
   - bucket breakdown
   - confidence / coverage of route mapping
   - warnings / caveats if mapping incomplete

Важно:
- не допусти двойного счета;
- явно зафиксируй unit of measurement;
- опиши denominator для каждой метрики;
- не мешай instances, files, routes и components в одной формуле без причины;
- если нужны несколько разных метрик — так и сделай, не маскируй всё одним процентом.

PHASE 5 — Refactor code structure
По итогам изменений приведи структуру проекта в более понятный вид.

Не делай pointless churn.
Рефакторь только там, где это реально улучшает:
- читаемость,
- тестируемость,
- расширяемость,
- ясность аналитической модели.

Возможно, стоит выделить отдельные слои/модули вроде:
- src/domain/*
- src/classification/*
- src/routes/*
- src/metrics/*
- src/reporting/*
- src/scanner/*

Но только если это действительно упрощает проект.
Не устраивай Java-ад в TypeScript.

Нужно:
- убрать очевидные naming leaks;
- уменьшить смешение old and new semantics;
- развести AST extraction, route mapping, analytical classification, metric aggregation, reporting.

PHASE 6 — Update outputs and docs
Нужно обновить всё, что пользователь реально видит.

Обнови:
- README.md
- AGENTS.MD
- docs/*
- ai-instructions/* если они теперь вводят в заблуждение своим описанием модели
- sample report structure / examples
- CLI output, если названия метрик изменились
- JSON schema / type definitions
- HTML/CSV/table reporters, где требуется

README должен:
- честно объяснять current deterministic model;
- разделять exact vs proxy metrics;
- описывать route-level support;
- описывать ограничения;
- не обещать AI/semantic duplicate detection;
- показывать, как читать Shadow Usage Proxy без самообмана.

AGENTS.MD должен:
- соответствовать реальному коду;
- быть короче README и практичнее;
- помогать следующему агенту быстро войти в контекст;
- описывать, как безопасно менять кодовую базу;
- фиксировать актуальные инварианты и архитектурные решения.

PHASE 7 — Testing
Добавь и обнови тесты.

Нужны:
1. Unit tests
- classification rules
- route resolution logic
- metric formulas
- bucket exclusivity
- denominator correctness
- fallback behavior when route mapping missing

2. Integration tests
- end-to-end scan on fixtures
- repo-level + route-level output
- mixed DS/local/wrapper scenarios
- shadow usage candidate scenarios
- neither scenarios
- partial route resolution scenarios

3. Invariants
Добавь проверки/тесты на инварианты:
- final buckets mutually exclusive
- no double counting
- proxy metrics clearly marked in output
- direct adoption never exceeds effective adoption proxy
- unknown/unmapped routes do not silently disappear
- repo summary equals aggregation of route-level data where applicable, или честно документирован fallback if not exact

Non-goals
Не делать:
- AI classification
- embeddings
- semantic duplicate detection через LLM
- probabilistic scoring without explainability
- огромный rewrite “потому что захотелось красоты”
- fake universal support for every router/framework on Earth

Обязательные правила работы с кодовой базой и коммитами

Работай так, будто после тебя код будет поддерживать живая команда, а не археологи после ядерной зимы.

1. Постоянно делай небольшие осмысленные коммиты
Это обязательное требование, а не пожелание.

Правила:
- не копи большие пачки изменений;
- коммит должен содержать одну законченную мысль;
- каждый коммит должен быть логически целостным и откатопригодным;
- после каждого значимого шага делай commit;
- если изменение нельзя объяснить в 1–2 предложениях, оно слишком большое и его надо дробить;
- нельзя смешивать в одном коммите доменную модель, рефакторинг структуры, тесты, README и unrelated cleanup, если это не одна логическая единица;
- перед следующим этапом убедись, что текущий этап собран, проходит тесты и зафиксирован отдельным коммитом.

Хорошие примеры commit messages:
- add analytical bucket model for adoption shadow neither
- create agents guide for deterministic adoption scanner workflow
- extract route resolution interfaces from metric aggregation
- implement deterministic route mapping fallback
- add shadow usage rule-based classifier
- split direct and proxy adoption metrics in report schema
- update reporters for proxy metric naming
- add invariants for mutually exclusive analytical buckets
- update README and AGENTS guide for deterministic route-level analytics

Плохие примеры:
- refactor
- fix stuff
- big update
- metrics improvements
- final changes

2. Иди итерационно и держи рабочее состояние после каждого шага
После каждого этапа:
- проект должен собираться;
- тесты для затронутой области должны проходить;
- типы не должны быть сломаны;
- выходные артефакты не должны быть в полумертвом промежуточном состоянии;
- если нужен временный переходный слой, он должен быть явным и короткоживущим.

Не оставляй “я потом добью” в нескольких местах сразу.
Не разводи многосерийный technical debt ради скорости.

3. Сначала проектируй, потом меняй код
Перед изменениями, которые затрагивают:
- доменную модель,
- report schema,
- route resolution,
- классификацию,
- aggregation,
- публичные названия метрик,

сначала обнови design doc, потом меняй код.

Если по ходу реализации решение изменилось:
- обнови design doc;
- обнови AGENTS.MD, если изменился способ работы или архитектурные ориентиры;
- зафиксируй, почему решение изменилось;
- не оставляй документацию в состоянии “теория одно, код другое”.

4. Соблюдай hygiene кодовой базы
Всегда следуй этим практикам:

Архитектурная дисциплина:
- разделяй parsing, extraction, route mapping, classification, aggregation, reporting;
- не смешивай доменную логику с форматированием вывода;
- не дублируй формулы в нескольких местах;
- держи single source of truth для типов и формул;
- если логика становится важной для продукта — выноси её из ad-hoc утилит в явный слой.

Управление сложностью:
- предпочитай маленькие чистые функции;
- избегай giant functions и giant switch/if blocks;
- если появляются сложные rule sets — выноси их в отдельные rule modules;
- называй сущности по смыслу, а не по историческому мусору;
- удаляй или изолируй legacy naming, если оно больше мешает, чем помогает.

Работа с совместимостью:
- если ломаешь публичную схему отчёта, CLI output или naming — делай это осознанно;
- документируй breaking changes;
- по возможности добавляй migration notes;
- не меняй публичное API “заодно”.

Работа с техническим долгом:
- не делай opportunistic cleanup везде подряд;
- чисти только то, что реально находится на пути изменений;
- если видишь важный долг, но он вне текущего scope — зафиксируй его в design doc / AGENTS.MD / TODO, но не раздувай задачу.

5. Обязательно закладывай инварианты и защиту от деградации
На каждом шаге думай не только “работает ли”, но и “как убедиться, что не сломается потом”.

Добавляй:
- unit tests на ключевые правила и формулы;
- integration tests на реальные сценарии;
- инварианты для новых аналитических сущностей;
- regression tests на баги и edge cases, которые нашёл во время работы.

Минимум инвариантов, которые должны быть защищены тестами:
- final analytical buckets mutually exclusive;
- no double counting in final metrics;
- direct adoption <= effective adoption proxy;
- proxy metrics всегда явно помечены как proxy;
- unmapped routes не исчезают молча;
- aggregation by repository не противоречит aggregation by route без явного documented fallback;
- structural category и analytical bucket не подменяют друг друга случайно;
- denominator у метрик стабилен и явно определён.

6. Любое нетривиальное решение должно быть объяснимым
Если вводишь новую эвристику, правило или fallback:
- опиши, зачем оно нужно;
- где его ограничения;
- какие false positive / false negative оно может давать;
- почему оно лучше альтернатив в рамках deterministic-only scope.

Не добавляй “умную” логику, которую нельзя объяснить.
Система должна быть explainable.

7. Избегай ложной универсальности
Если route resolution, shadow classification или grouping нельзя сделать надежно универсально:
- не маскируй это магией;
- делай explicit abstraction;
- добавляй provenance / confidence / resolution source;
- документируй supported patterns и unsupported cases.

Лучше честное ограничение, чем красивая ложь.

8. Работай через безопасные эволюционные изменения
Предпочитай:
- extract then replace;
- add new model, migrate call sites, then remove old model;
- introduce compatibility layer, затем сузь его;
- rename через последовательные понятные шаги, а не массовый хаос.

Избегай:
- тотального rename + move + logic rewrite в одном коммите;
- одновременного изменения формул, типов, структуры файлов и вывода без промежуточных checkpoints;
- больших изменений без промежуточных подтверждаемых состояний.

9. Поддерживай высокое качество документации рядом с кодом
Если меняешь смысл метрики, классификации или route-level логики:
- обнови README;
- обнови docs;
- обнови AGENTS.MD;
- обнови примеры отчётов;
- обнови комментарии в типах, если они вводят в заблуждение;
- убери устаревшие формулировки, а не просто добавь новые рядом.

Документация должна соответствовать коду сейчас, а не в какой-то счастливой параллельной вселенной.

10. В конце каждой фазы делай короткий self-review
После каждого крупного этапа проверь:
- что именно изменилось;
- какой commit это фиксирует;
- что осталось совместимым, а что стало breaking;
- какие тесты добавлены;
- какие риски остаются;
- что является следующим минимальным безопасным шагом.

11. Формат итоговой работы
В финале по каждой фазе покажи:
- какие файлы изменены;
- какие решения приняты;
- какие коммиты созданы;
- какие тесты добавлены/обновлены;
- какие ограничения остались;
- какие follow-up задачи стоит делать отдельно, а не пихать в этот scope;
- как был обновлён AGENTS.MD.

12. Приоритет качества
При конфликте между:
- “сделать быстрее”
и
- “сделать читаемо, объяснимо, тестируемо и откатопригодно”

всегда выбирай второе.

Нам не нужен heroic dirty refactor.
Нужна взрослая эволюция кодовой базы.

Ожидаемые артефакты в результате

В конце работы должны быть:
1. Обновленный код
2. Обновленные типы и report model
3. Route-level support
4. Deterministic Shadow Usage baseline
5. Refactored metric layer
6. Обновленные тесты
7. Обновленный README
8. Созданный и поддержанный AGENTS.MD
9. Design doc с финальной актуализацией
10. Короткое итоговое summary по фазам и коммитам

Критично:
никаких огромных коммитов, никаких “refactor everything”, никаких смешанных изменений без причины.
Работа должна идти мелкими проверяемыми шагами с постоянной фиксацией рабочего состояния.