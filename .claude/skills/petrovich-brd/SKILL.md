---
name: petrovich-brd
description: Собрать или обновить BRD «Петровича» по шаблону SKILL/make-bizness-treb. Использовать, когда просят написать, дополнить или пересобрать бизнес-требования (BRD) MVP.
---

# BRD «Петровича»

1. Прочитайте шаблон `SKILL/make-bizness-treb/SKILL.md` целиком и следуйте ему: роль, структура разделов, принципы.
2. Источники — по карте документов в `AGENTS.md`. Минимум: концепция `doc/concept_petrovich_v1_1.md`, `doc/brd_mobile_mvp.md`,
   `doc/mobile_analytics_screens.md`, `doc/Analiz/PV.md`, `doc/analytics_draft.md`,
   `doc/notes_product_architecture.md`. Методы API — Grep по `doc/autograph_api_reference.md`.
   Что реально реализовано — `../petrovich/README.md`.
3. Обновляете существующий BRD — правьте `doc/brd_petrovich_mvp_full.md`, не создавайте новую копию.
   Действуют приоритеты §4 и §8.1; Приложение А — детали без действующих приоритетов, расхождения — §7.4.
4. Гипотезы — в `[квадратных скобках]`, приоритеты — MoSCoW, недостающее — в «Открытые вопросы».
5. В конце поднимите версию и дату в шапке и перечислите пользователю, какие разделы изменились.
6. Запустите `/doc-consistency`, если менялись числа, сроки или ссылки на другие документы.
