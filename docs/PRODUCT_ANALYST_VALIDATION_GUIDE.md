# DS Adoption Scanner — Гайд Для Продуктового Аналитика

Этот документ описывает, как проверить корректность расчётов в отчётах DS Adoption Scanner.
Фокус: точные определения, формулы, проверяемые инварианты и практический чеклист.

---

## 1. Термины и сущности

### 1.1. Базовая единица подсчёта

- **Usage**: одно JSX-вхождение компонента (например, один `<Button />`).
- **Instances**: количество usage в выбранном срезе.

Пример: если в файле 3 раза встречается `<Button />`, это `3 instances`.

### 1.2. Категории usage

Каждый usage относится к одной категории:

- `design-system`
- `local-library`
- `local`
- `third-party`
- `html-native`

### 1.3. Прямой и транзитивный вклад

- **Direct**: usage категории `design-system` (явные импорты из пакетов DS).
- **Transitive**: usage не-DS категорий, отмеченные `transitiveDS`:
  - обычно это `local-library`,
  - иногда `third-party`.

`transitiveDS.coverage` — вес usage в эффективном adoption.

---

## 2. Ключевые поля отчёта (JSON)

См. файл `ds-report.json`:

- `summary.adoptionRate`
- `summary.effectiveAdoptionRate`
- `summary.totalComponentInstances`
- `summary.designSystems[]`
  - `adoptionRate`
  - `effectiveAdoptionRate`
  - `instances` (direct)
  - `transitiveInstances`
  - `transitiveWeighted`
- `summary.designSystemTotal.instances`
- `summary.localLibrary.instances`
- `summary.localReusable.instances`
- `summary.localUnique.instances`
- `summary.thirdParty.instances`
- `summary.htmlNative.instances`

---

## 3. Формулы расчёта

Обозначения:

- `DS = summary.designSystemTotal.instances`
- `L = summary.localLibrary.instances`
- `R = summary.localReusable.instances`
- `U = summary.localUnique.instances`
- `T = summary.thirdParty.instances`
- `H = summary.htmlNative.instances`

### 3.1. Локальный вклад в знаменателе

`localInDenominator` зависит от конфига:

1. Если `excludeLocalFromAdoption = true`, то `localInDenominator = 0`
2. Иначе если `excludeUniqueLocalFromAdoption = true`, то `localInDenominator = R`
3. Иначе `localInDenominator = R + U`

### 3.2. Direct adoption

`denominator = DS + L + localInDenominator`

`adoptionRate = DS / denominator * 100`

### 3.3. Total Instances (важно)

`totalComponentInstances = denominator`

То есть это denominator-scoped метрика:

- включает только категории, участвующие в direct adoption;
- не включает `third-party` и `html-native`;
- учитывает exclude-флаги для local.

### 3.4. Effective adoption

Пусть:

- `transitiveLocalLib = count(local-library usages with transitiveDS)`
- `transitiveThirdParty = count(third-party usages with transitiveDS)`
- `transitiveWeightedTotal = sum(usage.transitiveDS.coverage)` по всем usage с `transitiveDS`

Тогда:

- `effectiveDenominator = denominator + transitiveThirdParty`
- `effectiveAdoptionRate = (DS + transitiveWeightedTotal) / effectiveDenominator * 100`

---

## 4. Per Design System (по каждой DS)

Для конкретной DS `X`:

- `direct_X = count(usages where category='design-system' and dsName=X)`
- `transitive_X = count(usages where transitiveDS.dsName=X)`
- `transitiveWeighted_X = sum(coverage for usages where transitiveDS.dsName=X)`

Формулы:

- `adoptionRate_X = direct_X / denominator * 100`
- `effectiveAdoptionRate_X = (direct_X + transitiveWeighted_X) / effectiveDenominator * 100`

В таблице:

- `Direct Inst.` = `direct_X`
- `Transitive Inst.` = `transitive_X`

Важно: `Direct Inst.` **не включает** транзитивные usage.
Важно: в текущем UI для `Per Design System` не выводится `familiesUsed/totalFamilies`;
вместо этого показывается `Unique`.

---

## 5. Share (Denom.) в Category Breakdown

`Share (Denom.)` для категории — это доля от `denominator`, не от total всех usage.
В текущем UI в DS-строках `Category Breakdown` также показывается `Unique`, а не `familiesUsed/totalFamilies`.

Проверяемые формулы:

- `share_DS_X = direct_X / denominator * 100`
- `share_localLibrary = L / denominator * 100`
- `share_localCustom = localInDenominator / denominator * 100`

`third-party` и `html-native` помечаются `excluded` (они не участвуют в direct denominator).

Инвариант:

`sum(share_DS_X по всем DS) + share_localLibrary + share_localCustom = 100%`

(с погрешностью округления в UI).

---

## 6. Как работает coverage для транзитивных usage

### 6.1. `libraries[]` (pre-scan библиотеки)

Для pre-scanned библиотеки:

- если компонент найден как DS-backed, usage получает `coverage = 1.0`;
- если компонент не DS-backed, транзитивный вклад удаляется.

Если family библиотеки DS-backed, флаг может распространяться на sibling-компоненты этой family
(чтобы не терять DS-вклад из-за внутренней композиции/утилитарных файлов family).

### 6.2. `local-library` auto-detect

Если включён `transitiveAdoption.enabled` и usage без аннотации:

- сканер парсит source-файл компонента;
- если в файле есть импорт из DS-пакета, ставит `coverage = 1.0`.

### 6.3. `third-party` rules

- при explicit `transitiveRules[].coverage` используется указанное значение (0..1);
- без explicit coverage сканер пытается определить package-level coverage автоматически
  **только если** `transitiveAdoption.enabled = true`;
- если определить не удалось, usage не учитывается транзитивно (консервативный режим).

---

## 7. Family Coverage (для DS с `path/git`)

Если включён DS pre-scan (есть каталог DS families):

- `totalFamilies` — число families в каталоге DS;
- `familiesUsed` — число уникальных families, задетых usage;
- `familyCoverage = familiesUsed / totalFamilies * 100`.

В `familiesUsed` входят:

- direct DS usage с определённой `componentFamily`;
- транзитивные usage с `componentFamily` и `transitiveDS.dsName = эта DS`.

Примечание: это JSON-метрики (`summary.designSystems[]`). Они валидируются аналитиком по JSON,
даже если не отображаются в `Per Design System` и `Category Breakdown`.

---

## 8. Проверочный чеклист аналитика

### Шаг 1. Получить отчёт

```bash
ds-scanner analyze --config .ds-scanner.config.ts --output .ds-metrics/validation
```

### Шаг 2. Проверить базовые диапазоны

- `0 <= adoptionRate <= 100`
- `0 <= effectiveAdoptionRate <= 100`
- для каждой DS:
  - `0 <= adoptionRate <= 100`
  - `0 <= effectiveAdoptionRate <= 100`

### Шаг 3. Проверить direct denominator

1. Вычислить `localInDenominator` из флагов.
2. Проверить `denominator = DS + L + localInDenominator`.
3. Проверить `totalComponentInstances == denominator`.
4. Пересчитать `adoptionRate`.

### Шаг 4. Проверить Share (Denom.)

- Пересчитать доли категорий от `denominator`.
- Проверить сумму долей = `100%` (плюс-минус округление).

### Шаг 5. Проверить effective adoption

1. Пересчитать `transitiveWeightedTotal`.
2. Пересчитать `effectiveDenominator`.
3. Пересчитать `effectiveAdoptionRate`.

### Шаг 6. Проверить Per DS

Для каждой DS:

- пересчитать `direct_X`, `transitive_X`, `transitiveWeighted_X`;
- пересчитать `adoptionRate_X`, `effectiveAdoptionRate_X`;
- проверить соответствие полям в `summary.designSystems[]`.

### Шаг 7. Проверить family coverage (если доступно)

- сверить `familiesUsed <= totalFamilies`;
- пересчитать `familyCoverage`;
- убедиться, что `familiesUsed` учитывает и direct, и transitive usages с `componentFamily`.

---

## 9. Что считать нормальным в отчёте

- `effectiveAdoptionRate` может быть выше `adoptionRate` (нормально).
- `Direct Inst.` и `Transitive Inst.` в Per DS могут сильно различаться (нормально).
- Для DS без транзитивного вклада `Transitive Inst.` будет `0`/`—`.
- `third-party` и `html-native` в Category Breakdown отмечаются `excluded`.

---

## 10. Типичные причины расхождений при ручной проверке

- Проверка долей от всех usage вместо denominator.
- Игнорирование флагов:
  - `excludeLocalFromAdoption`
  - `excludeUniqueLocalFromAdoption`
- Смешение `direct` и `transitive` инстансов.
- Проверка по UI-округлениям вместо сырых значений в JSON.

---

## 11. Мини-словарь для коммуникации

- **Direct adoption**: только явные DS-импорты.
- **Effective adoption**: direct + транзитивный weighted вклад.
- **Denominator**: база для долей direct adoption.
- **Coverage**: вес транзитивного usage в effective adoption.
- **Family coverage**: доля покрытых DS-families.

---

## 12. Рекомендованный артефакт для ревью

Для проверки в PR/аудите хранить вместе:

1. `report.json`
2. Копию конфига `.ds-scanner.config.ts`
3. Короткий validation note:
   - версия сканера
   - значения exclude-флагов
   - ручной пересчёт 3 формул:
     - `adoptionRate`
     - `effectiveAdoptionRate`
     - сумма `Share (Denom.)`
