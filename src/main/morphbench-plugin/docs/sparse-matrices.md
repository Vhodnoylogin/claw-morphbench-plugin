# Generic sparse matrices: 0.4 development contract

The game and preview compile the same pinned C++ kernel. The plugin has no
alternative JavaScript evaluation formula. Its browser bridge retains ABI 1 and
the 28-byte rule layout. The shared `claw_matrix_gain_active` and
`claw_matrix_gain_epsilon` exports define active gains for the plugin.

## Validation and omission order

1. Validate metadata and at most 128 raw edges. Validate each edge's identifiers,
   function, allowed parameters, finite float32 gain/cap/value and cap in (0,1].
   A power exponent is an integer 1..8. A constant uses an empty source.
2. Normalize gain to float32 and omit `abs(gain) <= 1e-6F`, including signed zero.
   The cutoff is the float32 representation of 1e-6. Its immediately larger
   float32 value is active. Omitted edges are not stored, captured or exported.
3. On surviving edges, reject duplicate exact source/target pairs, inconsistent
   caps for a target and any provider-folded source/target intersection across edges.
   SKEE identity uses deterministic ASCII folding, A–Z to a–z. Authored spelling
   is retained; active case-only aliases within sources/targets are rejected.
   Same-spelling sources may feed different targets, and same-spelling targets
   may receive several sources with a consistent cap. At most 64 distinct active
   targets are supported.
4. Evaluate ordered surviving contributions with the shared kernel. Clamp each
   target sum once to [0,1], multiply by its shared cap, then round to float32.

Missing `function` means `linear`. JSON/XML serializers omit explicit linear
functions, inactive edges and absent coefficient/function entries. Constant,
positive, negative, smoothstep and bounded integer-power semantics are unchanged.
The order of surviving edges is never sorted or merged. Empty profiles are valid.

The Python catalog reader applies the same float32 omission contract while
validating source XML. Cross-language tests check its declared cutoff against
the actual compiled WASM export and exercise native parser boundaries too.

## Generic identifiers and preview ownership

Targets are printable-ASCII identifiers rather than a hardcoded body list.
A loaded model must provide every active target before applying a matrix. The
Morphbench setter uses its exact loaded spelling: a mismatched target is rejected
rather than silently renamed. Ambiguous model/vector case aliases are rejected.
Names are at most 160 characters, without surrounding whitespace or controls;
reserved JavaScript prototype identifiers remain unavailable at this boundary.
Native XML import/export additionally refuses XML delimiters/entities and
declarations. JSON can retain delimiter characters, with an explicit XML export error.

The complete supplied human vector remains available, including unmapped names
and ordinary `CLAW`-prefixed names. The plugin does not filter those values down
to the active conversion sources. Source lookup follows the provider's ASCII-folded
identity. Coefficient reference comparisons use that identity too and cannot
create two outputs from case aliases. Model names still do not establish body-family
provenance; the user declares the resource family and sex.

Preview writes own only active targets and acknowledged prior writes for the
same bound resource. Removing an edge or applying an empty matrix clears those
previous outputs and leaves unrelated controls unchanged. Missing targets fail
before either model is written. Existing identity/epoch/cleanup fences and
synchronized orientation behavior remain in force.

The native game adapter additionally retains its historical zero-valued cleanup
baseline and protects source capture from its own current/former outputs. Native
CLI comparison therefore permits extra legacy names only when their values are
exactly zero; every plugin-derived target must match float32 output exactly.

## Preset formats and installed configuration

Wolf JSON uses `{schemaVersion:1,kind:"claw-wolf-matrix",profile:{...}}`.
Native XML uses `MorphLinkProfiles` schema 1 with `Profile` elements and optional
`Defaults`. Both imports validate all supplied profiles before selecting the
exact declared ID/family/version/sex. Defaults, when present, must reference an
existing profile of the corresponding sex. Unknown fields and DTD/entities fail.

A standalone export may contain one profile. A full game configuration exports
exactly one HIMBO male profile and one selected CBBE or 3BA female profile, with
explicit defaults. It omits unselected families. An edited female profile must
be selected for export; the tool never silently replaces it with another family.

This architecture supplies no new authored head, ear, tail, claw, hair/skin
colour, breast or physics transformations. Such traits require authored resource
fields and explicit mappings in later work. The 0.4 development candidate still
requires its own browser/rendering and game acceptance.
