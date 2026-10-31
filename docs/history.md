# Repository extraction

The owner requested an independent plugin repository on31October2026.
A fresh full clone of CLAW was filtered to these plugin-only paths:

- `tools/morphbench-addon/`
- `release/morphbench-plugin/`
- `release/media/morphbench-plugin-0.3.0/`

No CLAW game, body, native runtime or shared evaluator source was copied.
The original CLAW history was not rewritten. Six nonempty plugin commits were
preserved, followed by an ordinary layout/dependency extraction commit here.

| Original CLAW commit | Filtered plugin commit |
|---|---|
| `9b36b00` | `e08e493` |
| `5936c12` | `8a3fdd6` |
| `3ca5ebc` | `ed9481e` |
| `0253666` | `d5da318` |
| `628e4ac` | `a176926` |
| `ef6ba48` | `9bea99c` |

Source-only layout: `src/main` contains production source and authored resources;
`src/test` contains tests; ignored `target/` contains build products/caches.
The C++ matrix implementation and canonical mapping remain hash-pinned external
CLAW dependencies. Downloaded dependency source is a build cache, never tracked.
Historical screenshots are publication evidence, not a claim of current runtime
or visual acceptance beyond their recorded scope.
