# Evidence inputs

Original betting snapshots keep the v1.12.1 schema and season/source eligibility. Never replace nulls with estimated results or fake prices. Storage bucket `edgeboard` is private; the server selects what each endpoint can disclose.

## Supplemental complete fantasy game records

Optional fantasy-game-logs.json is a JSON array. Each record must describe one real, sourced complete regular-season appearance. `verifiedComplete` is an importer assertion that must be backed by inspection/validation, not set merely to force a result. All scoring fields must be explicit finite numbers. Missing fields are not assumed zero. Player names resolve using the existing normalized identity; conflicting IDs require a future stronger identity migration.

Schema example (STRUCTURE ONLY: replace every placeholder with actual verified data; not a statistical fixture):

```json
[{"league":"NFL","player":"ACTUAL NAME","gameID":"SOURCE_EVENT_ID","date":"YYYY-MM-DD","teamID":"SOURCE_TEAM_ID","seasonType":"regular","seasonYear":2026,"verifiedComplete":true,"source":"https://SOURCE/BOX-SCORE","stats":{"passingyards":0,"passingtd":0,"passinginterceptions":0,"rushingyards":0,"rushingtd":0,"receivingyards":0,"receivingtd":0,"receptions":0}}]
```

The zeros above demonstrate the schema, not results. Only use zero when the source supports zero. The NFL calculation uses up to ten complete current-season/current-team games, at least three. Full derived fantasy data should be collected and validated for offensive players in the actual slate. Do not infer passing zeros from a receiving-only log. Existing NBA logs can usually supply the full displayed scoring vector by intersecting game IDs across statistics.

## Future schedule

Optional future-schedule.json:

```json
{"coverageThrough":"YYYY-MM-DD","games":[{"league":"NFL","teamID":"SOURCE_TEAM_ID","opponentID":"SOURCE_OPPONENT_ID","opponent":"OPPONENT_CODE","date":"YYYY-MM-DD","source":"https://SOURCE/SCHEDULE"}]}
```

Publish verified dates and separate team perspectives for both participants, with no duplicates. `coverageThrough` means the import checked the complete schedule through that date, not merely that one game is known. A team can have a bye. The first release displays opponents and earlier sourced current-season team points allowed; it does not multiply player forecasts by unvalidated schedule factors or claim a full remaining-season estimate. The readback uses a 21-day window and flags incomplete coverage.
