# Petrovich AI — документация API

Версия API: 0.1.0.
Формат спецификации: OpenAPI 3.1.0.

Документация подготовлена по предоставленной спецификации. Работающий сервер не проверялся.

## 1. Общие правила

API предоставляет доступ к транспортным средствам, телеметрии, аномалиям, проверке событий, аналитике, чат-агенту, подписчикам отчётов и синхронизации AutoGRAPH.

Базовый URL в спецификации не указан.

В примерах:

```bash
export BASE_URL="https://your-server.example"
```

Правила:

- Тела запросов передаются как JSON, кроме загрузки файлов.
- Для JSON используется `Content-Type: application/json`.
- Загрузка файлов использует `multipart/form-data`.
- Даты передаются как `YYYY-MM-DD`.
- Временные метки описаны форматом `date-time`.
- Параметры пути обязательны.
- Массивы query передаются повторением параметра, если операция не предусматривает CSV-строку.
- Пагинация использует `limit` и `offset`; ограничения зависят от метода.
- Авторизация и базовый URL не описаны.
- Отсутствие авторизации в спецификации не подтверждает отсутствие защиты на сервере.
- Произвольный JSON-объект в ответе не гарантирует конкретного состава полей.
- Пустая схема ответа означает, что его структура не определена.

Типовые успешные коды:

| Код | Использование |
|---|---|
| 200 | Большинство операций |
| 201 | Создание подписчика |
| 204 | Удаление подписчика, без тела |

## 2. Служебные методы и интерфейсы

| Метод | Путь | Назначение | Ответ |
|---|---|---|---|
| GET | `/health` | Проверка состояния сервиса | JSON-объект со строковыми значениями |
| GET | `/` | Главная панель | HTML |
| GET | `/v1` | Интерфейс аналитика V1 | HTML |
| GET | `/v2` | Интерфейс аналитика V2 | HTML |
| GET | `/v3` | Интерфейс аналитика V3 | HTML |

```bash
curl "$BASE_URL/health"
```

## 3. Транспортные средства

| Метод | Путь | Назначение | Ответ |
|---|---|---|---|
| GET | `/api/v1/vehicles` | Список транспортных средств | Массив VehicleOut |
| GET | `/api/v1/vehicles/{vehicle_id}` | Одно транспортное средство | VehicleOut |

`vehicle_id` — обязательное целое число в пути.

### 3.1. VehicleOut

| Поле | Тип | Обязательное |
|---|---|---|
| `id` | integer | Да |
| `plate` | string | Да |
| `model` | string | Да |
| `pump_model` | string или null | Нет |
| `created_at` | date-time | Да |

```bash
curl "$BASE_URL/api/v1/vehicles"
curl "$BASE_URL/api/v1/vehicles/1"
```

## 4. Загрузка данных

### POST /api/v1/ingest/file

Обязательное тело: `multipart/form-data`.

Модель формы — `Body_ingest_file_endpoint_api_v1_ingest_file_post`:

| Поле | Тип | Обязательное |
|---|---|---|
| `file` | Файл; в схеме string с contentMediaType application/octet-stream | Да |

Поддерживаемые форматы и максимальный размер файла не указаны.

```bash
curl -X POST "$BASE_URL/api/v1/ingest/file" \
  -F "file=@telemetry.csv"
```

Ответ: `IngestResult`.

### 4.1. IngestResult

| Поле | Тип | Обязательное | Примечание |
|---|---|---|---|
| `ingest_run_id` | integer | Да | ID загрузки |
| `vehicle_id` | integer | Да | ID транспортного средства |
| `points_loaded` | integer | Да | Загружено точек |
| `points_attempted` | integer | Нет | По умолчанию 0 |
| `file_name` | string | Да | Имя файла |
| `started_at` | date-time | Да | Начало |
| `finished_at` | date-time | Да | Завершение |
| `errors` | string[] | Нет | По умолчанию [] |

## 5. Аномалии

| Метод | Путь | Назначение | Ответ |
|---|---|---|---|
| POST | `/api/v1/anomalies/detect/{vehicle_id}` | Запустить обнаружение | Массив AnomalyOut |
| GET | `/api/v1/anomalies/{vehicle_id}` | Аномалии транспортного средства | JSON-объект |
| POST | `/api/v1/anomalies/{anomaly_id}/resolve` | Изменить статус | AnomalyOut |
| GET | `/api/v1/anomalies/feed` | Лента с объединением дубликатов | JSON-объект |
| GET | `/api/v1/anomalies/facets` | Счётчики фильтров | JSON-объект |
| POST | `/api/v1/anomalies/bulk-resolve` | Массовое изменение статуса | JSON-объект |

`vehicle_id` и `anomaly_id` в этих путях — целые числа.

### 5.1. AnomalyOut

| Поле | Тип | Обязательное |
|---|---|---|
| `id` | integer | Да |
| `vehicle_id` | integer | Да |
| `ts` | date-time | Да |
| `kind` | string | Да |
| `severity` | string | Да |
| `description` | string | Да |
| `evidence_json` | string или null | Нет |
| `created_at` | date-time | Да |
| `status` | string | Нет; по умолчанию new |

`evidence_json` описан как строка, а не вложенный JSON-объект.

### 5.2. Список аномалий транспортного средства

`GET /api/v1/anomalies/{vehicle_id}`

| Query-параметр | Ограничения | По умолчанию |
|---|---|---|
| `limit` | 1–1000 | 20 |
| `offset` | Не меньше 0 | 0 |
| `severity` | high, med, low | Не задан |
| `status` | new, resolved, dismissed | new |

### 5.3. Изменение статуса

`POST /api/v1/anomalies/{anomaly_id}/resolve`

Обязательное JSON-тело — `ResolveRequest`.

| Поле | Тип | Обязательное | По умолчанию |
|---|---|---|---|
| `status` | string | Нет | resolved |

Для поля `status` в этой модели enum не задан.

```bash
curl -X POST "$BASE_URL/api/v1/anomalies/123/resolve" \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'
```

### 5.4. Лента

`GET /api/v1/anomalies/feed`

| Query-параметр | Описание | По умолчанию |
|---|---|---|
| `vehicle_id` | Целое число; без него — весь парк | Не задан |
| `severity` | CSV-строка: high,med,low | Не задан |
| `status` | CSV-строка: new,resolved,dismissed | new |
| `kind` | Типы аномалий через запятую | Не задан |
| `from` | Дата включительно | Не задан |
| `to` | Дата включительно | Не задан |
| `q` | Подстрока в описании или типе | Не задан |
| `sort` | ts_desc, ts_asc, severity, duplicates | ts_desc |
| `group` | exact, day | exact |
| `limit` | 1–500 | 100 |
| `offset` | Не меньше 0 | 0 |

Одна строка ленты представляет отдельную находку с объединёнными дубликатами.

- `total` — число находок для пагинации.
- `raw_total` — число исходных записей до объединения.

Полная структура строк не раскрыта.

```bash
curl --get "$BASE_URL/api/v1/anomalies/feed" \
  --data-urlencode "severity=high,med" \
  --data-urlencode "status=new" \
  --data-urlencode "from=2026-11-01" \
  --data-urlencode "to=2026-11-10" \
  --data-urlencode "limit=50"
```

### 5.5. Счётчики

`GET /api/v1/anomalies/facets`

Query-параметры:

- `vehicle_id`: integer или null;
- `severity`: string или null;
- `status`: string или null, по умолчанию new;
- `kind`: string или null;
- `from`, `to`: string или null;
- `q`: string или null;
- `group`: exact или day, по умолчанию exact.

Счётчики по важности намеренно игнорируют фильтр `severity`, чтобы показывать количество записей при переключении вкладок.

### 5.6. Массовое изменение статуса

`POST /api/v1/anomalies/bulk-resolve`

Обязательное JSON-тело — `BulkResolveRequest`.

| Поле | Тип | Обязательное | Ограничения |
|---|---|---|---|
| `ids` | integer[] | Да | 1–500 элементов |
| `status` | string | Нет | По умолчанию resolved |
| `group` | string | Нет | По умолчанию exact |

```json
{
  "ids": [123, 124],
  "status": "resolved",
  "group": "exact"
}
```

Передаются ID представителей из ленты. Операция обрабатывает также записи-дубликаты, которые они представляют.

`group` следует передавать в соответствии с группировкой исходной ленты.

## 6. События и решения проверяющих

Здесь используются статусы `new`, `confirmed`, `dismissed`.

Они отличаются от статусов семейства `/api/v1/anomalies`.

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/v1/anomaly-events/options` | Параметры формы проверки |
| GET | `/api/v1/anomaly-events` | Список событий |
| GET | `/api/v1/anomaly-events/state` | Состояния выбранных событий |
| POST | `/api/v1/anomaly-events/review` | Массовая проверка |
| POST | `/api/v1/anomaly-events/{event_id}/review` | Проверка одного события |
| GET | `/api/v1/anomaly-events/{event_id}/history` | История проверки события |
| GET | `/api/v1/anomaly-events/reviewers` | Имена проверяющих |
| GET | `/api/v1/anomaly-events/reviews` | Журнал решений |

Ответы не имеют фиксированной структуры полей. Для журнала решений схема ответа пустая.

`event_id` в путях — положительное целое, не больше 9223372036854775807.

### 6.1. Список событий

`GET /api/v1/anomaly-events`

| Query-параметр | Тип / ограничения | По умолчанию |
|---|---|---|
| `date_from` | date или null | Не задан |
| `date_to` | date или null | Не задан |
| `id` | integer[] | [] |
| `vehicle_id` | integer[] | [] |
| `organization_id` | integer[] | [] |
| `kind` | string[] | [] |
| `status` | string[] | [] |
| `severity` | string[] | [] |
| `reviewer` | string[] | [] |
| `synthetic` | include, exclude, only | include |
| `limit` | 1–200 | 50 |
| `offset` | 0–1000000 | 0 |

Массивы передаются повторением параметра:

```bash
curl --get "$BASE_URL/api/v1/anomaly-events" \
  --data-urlencode "vehicle_id=1" \
  --data-urlencode "vehicle_id=2" \
  --data-urlencode "status=new" \
  --data-urlencode "synthetic=exclude"
```

### 6.2. Состояния событий

`GET /api/v1/anomaly-events/state`

Обязательный query-параметр:

| Параметр | Тип | Ограничения |
|---|---|---|
| `ids` | integer[] | 1–100 элементов |

```bash
curl "$BASE_URL/api/v1/anomaly-events/state?ids=123&ids=124"
```

### 6.3. Проверка одного события

`POST /api/v1/anomaly-events/{event_id}/review`

Обязательное тело — `ReviewRequest`.

Дополнительные поля запрещены.

| Поле | Тип | Обязательное | Ограничения |
|---|---|---|---|
| `status` | string | Да | new, confirmed, dismissed |
| `reviewed_by` | string | Да | 1–128 символов |
| `note` | string или null | Нет | До 2000 символов |
| `expected_status` | string | Да | new, confirmed, dismissed |

```json
{
  "status": "confirmed",
  "reviewed_by": "operator",
  "note": "Проверено по телеметрии",
  "expected_status": "new"
}
```

`expected_status` — статус, который видел проверяющий. Он предназначен для защиты от перезаписи решения по устаревшей карточке.

Код и формат ответа при конфликте не описаны.

### 6.4. Массовая проверка

`POST /api/v1/anomaly-events/review`

Обязательное тело — `BulkReviewRequest`.

Дополнительные поля запрещены.

| Поле | Тип | Обязательное | Ограничения |
|---|---|---|---|
| `status` | string | Да | new, confirmed, dismissed |
| `reviewed_by` | string | Да | 1–128 символов |
| `note` | string или null | Нет | До 2000 символов |
| `events` | SeenEvent[] или null | Нет | 1–1000 элементов, если передан массив |
| `filter` | EventFilter или null | Нет | Фильтр событий |
| `expected` | integer или null | Нет | Не меньше 0 |

Для выбранных событий:

```json
{
  "status": "confirmed",
  "reviewed_by": "operator",
  "events": [
    {"id": 123, "status": "new"},
    {"id": 124, "status": "new"}
  ]
}
```

Для событий по фильтру:

```json
{
  "status": "dismissed",
  "reviewed_by": "operator",
  "filter": {
    "vehicle_ids": [1],
    "statuses": ["new"],
    "synthetic": "exclude"
  },
  "expected": 12
}
```

Описание операции предусматривает `events` либо `filter` с увиденным количеством `expected`. Схема не выражает взаимоисключение этих вариантов.

### 6.5. SeenEvent

Дополнительные поля запрещены.

| Поле | Тип | Обязательное | Ограничения |
|---|---|---|---|
| `id` | integer | Да | Положительное; максимум около 9.223372036854776e18 в числовом представлении схемы |
| `status` | string | Да | new, confirmed, dismissed |

Клиентам JavaScript нужно учитывать предел точного представления целых чисел.

### 6.6. EventFilter

Все поля необязательны. Дополнительные поля запрещены.

| Поле | Тип | Ограничения |
|---|---|---|
| `date_from` | date или null | — |
| `date_to` | date или null | — |
| `event_ids` | integer[] | До 50 положительных ID |
| `vehicle_ids` | integer[] | До 50 положительных ID |
| `organization_ids` | integer[] | До 20 положительных ID |
| `kinds` | string[] | До 20 элементов |
| `statuses` | string[] | До 3: new, confirmed, dismissed |
| `severities` | string[] | До 3: high, med, low |
| `synthetic` | string | include, exclude, only; по умолчанию include |
| `reviewers` | string[] | До 50 элементов |

Для ID в этой модели задан верхний предел порядка 9223372036854775807; в JSON-схеме он представлен числом с плавающей точкой.

### 6.7. История и проверяющие

`GET /api/v1/anomaly-events/{event_id}/history`

Дополнительных query-параметров нет. Ответ — JSON-объект.

`GET /api/v1/anomaly-events/reviewers`

Параметры не объявлены. Ответ — JSON-объект.

### 6.8. Журнал решений

`GET /api/v1/anomaly-events/reviews`

| Query-параметр | Тип / ограничения | По умолчанию |
|---|---|---|
| `reviewed_by` | string до 128 символов или null | Не задан |
| `reviewer` | string[] | [] |
| `date_from` | date или null | Не задан |
| `date_to` | date или null | Не задан |
| `event_id` | Положительный integer, максимум 9223372036854775807, или null | Не задан |
| `id` | integer[] | [] |
| `vehicle_id` | integer[] | [] |
| `organization_id` | integer[] | [] |
| `kind` | string[] | [] |
| `status` | string[] | [] |
| `severity` | string[] | [] |
| `synthetic` | include, exclude, only | include |
| `batch_id` | string или null | Не задан |
| `format` | json, csv | json |
| `limit` | 1–200 | 50 |
| `offset` | 0–1000000 | 0 |

## 7. Аналитика

| Метод | Путь | Назначение / тело |
|---|---|---|
| GET | `/api/v1/analyst/options` | Настройки формы и границы данных |
| POST | `/api/v1/analyst/ask` | AskBody |
| GET | `/api/v1/analyst/fuel-ml/options` | Настройки Fuel ML |
| POST | `/api/v1/analyst/fuel-ml/ask/stream` | FuelMLQuery |
| GET | `/api/v1/analyst/dashboard/templates` | Шаблоны панели |
| GET | `/api/v1/analyst/dashboard/options` | Настройки панели |
| POST | `/api/v1/analyst/dashboard/ask/stream` | DashboardQuestion |

У GET-методов параметры не объявлены.

Ответ обычного аналитика — JSON-объект без фиксированных полей.

Для потоковых методов объявлен `application/json` с пустой схемой. Протокол потока и формат событий не определены.

### 7.1. AskBody

| Поле | Тип | Обязательное | Ограничения / значение по умолчанию |
|---|---|---|---|
| `date_from` | date | Да | — |
| `date_to` | date | Да | — |
| `comment` | string | Нет | До 1000 символов; "" |
| `vehicle_id` | integer или null | Нет | — |
| `focus` | string | Нет | auto |
| `mode` | string | Нет | v1 |

```json
{
  "date_from": "2026-11-01",
  "date_to": "2026-11-10",
  "comment": "Проанализируй аномалии",
  "vehicle_id": 1,
  "focus": "auto",
  "mode": "v1"
}
```

### 7.2. FuelMLQuery

Дополнительные поля запрещены.

| Поле | Тип | Обязательное | Ограничения / значение по умолчанию |
|---|---|---|---|
| `date_from` | date | Да | — |
| `date_to` | date | Да | — |
| `comment` | string | Нет | До 1000 символов; "" |
| `vehicle_id` | integer или null | Нет | Строго больше 0, если задан |
| `focus` | string | Нет | Значения ниже; auto |
| `mode` | string | Нет | v2 или v3; v3 |
| `history` | ConversationMessage[] | Нет | До 20 сообщений |

Допустимые `focus`:

```text
auto
anomalies
telemetry_gap
fuel_drain
towing
speed_without_movement
data_gap
data_gap_channel_unavailable
data_gap_all_channels_unavailable
data_gap_signal_unavailable
data_gap_gps_unavailable
```

```bash
curl -N -X POST "$BASE_URL/api/v1/analyst/fuel-ml/ask/stream" \
  -H "Content-Type: application/json" \
  -d '{
    "date_from":"2026-11-01",
    "date_to":"2026-11-10",
    "focus":"fuel_drain",
    "mode":"v3",
    "comment":"Покажи подозрительные сливы топлива"
  }'
```

### 7.3. ConversationMessage

Дополнительные поля запрещены.

| Поле | Тип | Обязательное | Ограничения |
|---|---|---|---|
| `role` | string | Да | user, assistant |
| `content` | string | Да | До 4000 символов |

### 7.4. DashboardQuestion

Дополнительные поля запрещены.

| Поле | Тип | Обязательное | Ограничения |
|---|---|---|---|
| `question` | string | Да | 1–1000 символов |
| `history` | ConversationMessage[] | Нет | До 20 сообщений |
| `previous_queries` | QueryArgs[] | Нет | До 8 объектов |

```json
{
  "question": "Покажи количество аномалий по автомобилям",
  "history": [],
  "previous_queries": []
}
```

### 7.5. QueryArgs

Дополнительные поля запрещены.

| Поле | Тип | Обязательное | Ограничения / значение по умолчанию |
|---|---|---|---|
| `query_id` | string | Да | Значения ниже |
| `horizon_days` | integer | Нет | 7 или 30; 7 |
| `date_from` | date или null | Нет | — |
| `date_to` | date или null | Нет | — |
| `vehicle_ids` | integer[] | Нет | До 50 |
| `organization_ids` | integer[] | Нет | До 20 |
| `event_type` | string или null | Нет | Значения ниже |
| `severity` | string или null | Нет | low, medium, high |
| `synthetic` | string | Нет | include, exclude, only; include |
| `event_id` | integer или null | Нет | Строго больше 0 |
| `limit` | integer | Нет | 1–100; 50 |

`event_type`:

```text
telemetry_gap
fuel_drain
towing
speed_without_movement
data_gap
data_gap_channel_unavailable
data_gap_all_channels_unavailable
data_gap_signal_unavailable
data_gap_gps_unavailable
```

`query_id`:

```text
anomalies_by_vehicle
anomalies_by_type
anomalies_by_day
anomalies_by_status
anomalies_by_severity
anomalies_by_organization
anomalies_by_week
anomalies_by_hour
anomalies_by_weekday
high_severity_by_vehicle
high_severity_by_day
unreviewed_by_vehicle
cumulative_anomalies_by_day
fuel_drain_by_vehicle
fuel_drain_by_day
fuel_drain_volume_by_vehicle
fuel_drain_volume_by_day
towing_by_vehicle
telemetry_gaps_by_vehicle
stationary_speed_by_vehicle
average_duration_by_type
average_duration_by_vehicle
duration_by_day
anomalies_by_detector
anomalies_by_model_version
anomaly_summary
anomaly_events
event_details
fuel_forecast
```

`QueryArgs.severity` использует `medium`, тогда как фильтры аномалий и EventFilter используют `med`.

## 8. Чат-агент

| Метод | Путь | Назначение | Ответ |
|---|---|---|---|
| GET | `/api/v1/agent/status` | Несекретные настройки | JSON-объект |
| POST | `/api/v1/agent/ask` | Синхронный запрос | JSON-объект |
| POST | `/api/v1/agent/ask/stream` | Потоковый запрос | Структура не определена |
| GET | `/api/v1/agent/history/{session_id}` | История сессии | Массив JSON-объектов |

Статус показывает конфигурацию и не подтверждает успешное выполнение запроса к внешнему API.

### 8.1. AskRequest

Обязательное тело обоих методов `ask`.

| Поле | Тип | Обязательное | По умолчанию |
|---|---|---|---|
| `session_id` | string или null | Нет | Не задан |
| `question` | string | Да | — |
| `history` | object[] | Нет | [] |
| `use_llm` | boolean | Нет | true |

```bash
curl -X POST "$BASE_URL/api/v1/agent/ask" \
  -H "Content-Type: application/json" \
  -d '{
    "question":"Какие автомобили требуют проверки?",
    "history":[],
    "use_llm":true
  }'
```

### 8.2. История сессии

`session_id` — обязательная строка в пути.

Query-параметр `limit` — integer, по умолчанию 40. Минимум и максимум не заданы.

## 9. Подписчики и отчёты

| Метод | Путь | Назначение | Ответ |
|---|---|---|---|
| GET | `/api/v1/subscribers` | Список подписчиков | 200, SubscriberOut[] |
| POST | `/api/v1/subscribers` | Создать подписчика | 201, SubscriberOut |
| PATCH | `/api/v1/subscribers/{subscriber_id}` | Изменить подписчика | 200, SubscriberOut |
| DELETE | `/api/v1/subscribers/{subscriber_id}` | Удалить подписчика | 204, без тела |
| GET | `/api/v1/reports/preview` | Сформировать отчёт без отправки | 200, JSON-объект |
| POST | `/api/v1/reports/send-now` | Отправить отчёт активным подписчикам через Telegram | 200, JSON-объект |
| POST | `/api/v1/reports/send-to/{chat_id}` | Отправить отчёт в отдельный чат | 200, JSON-объект |

`subscriber_id` и `chat_id` в пути — целые числа.

Для методов отчётов JSON-тело не объявлено.

`send-to` обходит таблицу подписчиков.

### 9.1. SubscribeRequest

Обязательное тело создания подписчика.

| Поле | Тип | Обязательное | По умолчанию |
|---|---|---|---|
| `chat_id` | integer | Да | — |
| `name` | string или null | Нет | Не задан |
| `schedule_time` | string | Нет | 09:30 |

```json
{
  "chat_id": 123456789,
  "name": "Диспетчер",
  "schedule_time": "09:30"
}
```

Часовой пояс и проверка формата времени не описаны.

### 9.2. SubscriberPatch

Обязательное тело PATCH-запроса. Все поля необязательны.

| Поле | Тип |
|---|---|
| `schedule_time` | string или null |
| `active` | boolean или null |
| `name` | string или null |

Семантика явного `null` не определена.

### 9.3. SubscriberOut

| Поле | Тип | Обязательное |
|---|---|---|
| `id` | integer | Да |
| `chat_id` | integer | Да |
| `name` | string или null | Нет |
| `username` | string или null | Нет |
| `schedule_time` | string | Да |
| `active` | boolean | Да |

## 10. Синхронизация AutoGRAPH

| Метод | Путь | Назначение | Ответ |
|---|---|---|---|
| POST | `/api/v1/sync/autograph` | Запустить синхронизацию | IngestResult |
| GET | `/api/v1/sync/autograph/preview` | Окно SD/ED и устройства без загрузки | JSON-объект |
| GET | `/api/v1/sync/autograph/status` | Состояние последней фоновой синхронизации | JSON-объект |
| GET | `/api/v1/sync/autograph/schemas` | Доступные схемы | JSON-объект |

### 10.1. Запуск

`POST /api/v1/sync/autograph`

Все параметры передаются в query.

| Параметр | Тип | По умолчанию |
|---|---|---|
| `days_back` | integer | 7 |
| `devices` | integer | 3 |
| `schema_id` | string или null | Не задан |

Дополнительные числовые ограничения не заданы.

Сначала синхронизируются первые `devices` устройств за последние `days_back` дней, остальные обрабатываются в фоне.

### 10.2. Предпросмотр

`GET /api/v1/sync/autograph/preview`

Необязательный query-параметр `days_back`: integer, по умолчанию 7.

У `/status` и `/schemas` параметры не объявлены.

```bash
curl "$BASE_URL/api/v1/sync/autograph/preview?days_back=7"

curl -X POST \
  "$BASE_URL/api/v1/sync/autograph?days_back=7&devices=3"

curl "$BASE_URL/api/v1/sync/autograph/status"
```

## 11. Телеметрия отдельного транспортного средства

Общий префикс:

```text
/api/v1/vehicle/{vehicle_id}
```

Здесь `vehicle` используется в единственном числе.

`vehicle_id` — обязательное целое число.

| Метод | Суффикс | Назначение | Ответ |
|---|---|---|---|
| GET | `/track` | Трек | JSON-объект |
| GET | `/points` | Точки телеметрии | JSON-объект |
| GET | `/points.csv` | Выгрузка точек | Структура не определена |
| GET | `/daily` | Суточные данные | Массив JSON-объектов |
| GET | `/daily.csv` | Выгрузка суточных данных | Структура не определена |
| GET | `/anomalies` | Аномалии | JSON-объект |
| GET | `/anomalies/count` | Счётчики по важности | JSON-объект |

### 11.1. Трек

`GET /api/v1/vehicle/{vehicle_id}/track`

| Query-параметр | Ограничения | По умолчанию |
|---|---|---|
| `from` | Строка YYYY-MM-DD, включительно | Не задан |
| `to` | Строка YYYY-MM-DD, включительно | Не задан |
| `limit` | 1–20000 | 2000 |
| `offset` | Не меньше 0 | 0 |

### 11.2. Точки

`GET /api/v1/vehicle/{vehicle_id}/points`

| Query-параметр | Ограничения | По умолчанию |
|---|---|---|
| `from` | Строка YYYY-MM-DD, включительно | Не задан |
| `to` | Строка YYYY-MM-DD, включая конец дня | Не задан |
| `limit` | 1–10000 | 100 |
| `offset` | Не меньше 0 | 0 |

```bash
curl --get "$BASE_URL/api/v1/vehicle/1/points" \
  --data-urlencode "from=2026-11-01" \
  --data-urlencode "to=2026-11-10" \
  --data-urlencode "limit=100"
```

### 11.3. Аномалии

`GET /api/v1/vehicle/{vehicle_id}/anomalies`

| Query-параметр | Ограничения | По умолчанию |
|---|---|---|
| `severity` | high, med, low | Не задан |
| `status` | new, resolved, dismissed | new |
| `limit` | 1–1000 | 20 |
| `offset` | Не меньше 0 | 0 |

### 11.4. Счётчики аномалий

`GET /api/v1/vehicle/{vehicle_id}/anomalies/count`

Необязательные query-параметры:

- `severity`: high, med, low;
- `status`: new, resolved, dismissed.

Статус по умолчанию не указан.

### 11.5. CSV и суточные данные

Для `/points.csv`, `/daily`, `/daily.csv` дополнительные query-параметры не объявлены.

```bash
curl "$BASE_URL/api/v1/vehicle/1/daily.csv" \
  -o daily.csv
```

Для CSV-маршрутов спецификация объявляет `application/json` с пустой схемой.

Реальный Content-Type, кодировка, разделитель и состав колонок требуют уточнения.

## 12. Ошибки

Для операций с входными параметрами и телом обычно объявлен ответ HTTP 422 с моделью `HTTPValidationError`.

Пример структуры:

```json
{
  "detail": [
    {
      "loc": ["body", "question"],
      "msg": "Field required",
      "type": "missing"
    }
  ]
}
```

Текст сообщения иллюстративный.

### 12.1. HTTPValidationError

| Поле | Тип | Обязательное |
|---|---|---|
| `detail` | ValidationError[] | Нет |

### 12.2. ValidationError

| Поле | Тип | Обязательное |
|---|---|---|
| `loc` | Массив строк или целых чисел | Да |
| `msg` | string | Да |
| `type` | string | Да |
| `input` | Любое JSON-значение | Нет |
| `ctx` | object | Нет |

Другие ошибки могут существовать в реализации, но спецификация не определяет их контракт.

## 13. Ограничения спецификации

Не определены:

- базовый URL и механизм авторизации;
- точные схемы многих JSON-ответов;
- протокол потоковых сообщений;
- ошибки доступа и отсутствующих записей;
- ошибки конфликтов проверки;
- ошибки внешних интеграций;
- поддерживаемые форматы и размеры файлов;
- параметры CSV;
- часовые пояса;
- ограничения частоты запросов;
- правила повторного выполнения изменяющих операций.

Дополнительные поля запрещены в моделях:

- BulkReviewRequest;
- ReviewRequest;
- SeenEvent;
- EventFilter;
- ConversationMessage;
- DashboardQuestion;
- FuelMLQuery;
- QueryArgs.

Обязательность поля и возможность `null` — разные свойства.

Необязательное поле можно не передавать. Поле, допускающее `null`, может иметь значение `null`; это не определяет его обязательность.

Перед реализацией клиента следует уточнить схемы ответов, авторизацию, временную политику и поведение изменяющих операций при повторных запросах.