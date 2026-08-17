# Search Criteria — schema 1.0.0

`ResearchCriteria` is the shared, validated contract stored in `research_projects.structured_query`. It is defined once in `@scout/schemas` and used by the UI, Worker, domain and persistence adapters.

## Shape

```json
{
  "category": "smartphone",
  "brands": ["Apple"],
  "models": ["iPhone 13"],
  "variants": [],
  "storageGb": [128],
  "memoryGb": [],
  "maximumPrice": { "amountMinor": 180000, "currency": "BRL" },
  "acceptedDefects": ["cracked_screen", "broken_back_glass", "degraded_battery"],
  "rejectedDefects": ["activation_lock", "logic_board_failure", "no_power"],
  "acceptedConditions": ["for_repair"],
  "countries": [],
  "regions": [],
  "requiredFunctionalStates": [{ "component": "device", "minimumStatus": "probably_working" }],
  "preferredEvidence": ["device_powered_on"],
  "additionalKeywords": [],
  "excludedKeywords": [],
  "opportunityPolicy": {
    "processingCostMinor": 9000,
    "desiredMarginMinor": 35000,
    "repairReserveMinor": 5000,
    "transactionCostRate": 0.1
  }
}
```

Money uses integer minor units. Supported currencies are `BRL`, `USD`, `EUR` and `CNY`. A defect cannot be both accepted and rejected. Empty criteria are rejected; at least one searchable category, model, keyword, price, defect, condition or functional requirement is required.

## Taxonomy 1.0.0

- Categories: `smartphone`, `laptop`.
- Brand: `Apple`.
- Conditions: `used`, `refurbished`, `for_repair`, `parts_only`.
- Defects: `cracked_screen`, `broken_back_glass`, `degraded_battery`, `activation_lock`, `icloud_lock`, `logic_board_failure`, `no_power`, `parts_only`.
- Functional components: `device`, `display`, `battery`, `logic_board`.
- Minimum functional states: `confirmed_working`, `probably_working`, `possibly_working`.

The taxonomy is intentionally small. Unknown enum values are rejected rather than silently persisted.

`opportunityPolicy` is optional and does not change search recall. When present,
the collection consumer calculates and persists the F3 valuation after listing
ingestion. It is a recommendation policy expressed in minor units, not an
authorization to buy; omitting it keeps collection and persistence active while
leaving valuation inactive until the client supplies costs and margin.
