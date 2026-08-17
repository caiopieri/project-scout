# Intent Interpreter — Marco 3

## Contract

`IntentInterpreter.interpret()` accepts a validated natural-language query and returns structured criteria plus confidence, ambiguities, warnings, unidentified fields, provider/model, rule or prompt version, taxonomy version and interpretation timestamp.

Implementations:

- `DeterministicIntentInterpreter`: active operational provider, rule version `1.0.0`, Portuguese-focused.
- `MockIntentInterpreter`: deterministic test/demo implementation; it does not claim to be an external AI.
- `AiIntentInterpreter`: disabled stub that throws until a real provider is explicitly configured in a later task.

The Worker generates persisted provider/model/version/timestamp metadata. It ignores metadata supplied by the browser, so a client cannot claim that a real AI analyzed a project.

## Initial aliases

| User wording | Canonical value |
| --- | --- |
| `icloud`, `bloqueado no icloud`, `Activation Lock` | `activation_lock` |
| `não liga`, `sem ligar` | `no_power` |
| `defeito de placa`, `placa ruim` | `logic_board_failure` |
| `tela quebrada`, `tela trincada` | `cracked_screen` |
| `traseira quebrada`, `vidro traseiro quebrado` | `broken_back_glass` |
| `bateria ruim`, `bateria degradada` | `degraded_battery` |
| `para peças` | condition/defect `parts_only` |

The rules recognize iPhone, iPhone 13, MacBook, MacBook Pro, MacBook Pro 16, GB/TB capacities, BRL/USD/EUR/CNY ceilings, working requirements and the initial condition vocabulary. For MacBooks, capacities below 256 GB are initially treated as memory and capacities of 256 GB or more as storage.

## Ambiguity and contradiction policy

- Missing model produces an ambiguity; the interpreter never invents one.
- Price without currency produces a warning and is not persisted as `maximumPrice`.
- When the same defect is explicitly accepted and rejected, rejection wins and an ambiguity is recorded.
- Unknown language remains unknown; no external model is called as fallback.

## Future real AI

A future adapter must run only in the Worker, request structured JSON, validate it with the same schemas, enforce timeout and limited retries, record model/prompt versions and fall back deterministically. No real AI integration exists in Marco 3.
