# Generic sparse matrices: 0.4 development contract

The game and preview compile the same pinned C++ kernel. The plugin has no
alternative JavaScript evaluation formula. Its browser bridge retains ABI 1 and
the 28-byte rule layout. The shared `claw_matrix_gain_active` and
`claw_matrix_gain_epsilon` exports define active gains for the plugin.
`claw_matrix_source_kind` and `claw_matrix_source_value_valid` define reserved
actor/human sources and their value domain, including the builder's final catalog
gate. `claw_matrix_source_neutral` supplies unavailable human-channel arithmetic
neutrals; JavaScript contains no alternative binding formula.

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
The low-level XML parser is not the reserved-name semantic authority. Production
builds call `catalog_with_shared_validation`, retaining every normalized raw edge
for the real WASM gate before producing the pruned catalog. Invalid reserved names
therefore cannot disappear behind a zero or near-zero coefficient.

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

## Actor scalars and Vanilla resources

The reserved `$actor.` namespace is checked by the shared kernel after ASCII
folding. Only the exact canonical source `$actor.weight` is currently supported.
Case variants and unknown actor fields are rejected; no actor-namespace field
can be a target. These structural checks also apply to inactive edges. The scalar
is normalized float32 in [0,1]. An active weight edge requires an explicit value;
ordinary absent human morphs still use preview zero. Constant/empty matrices do
not require actor input. Human coefficients are never multiplied by actor weight.

`evaluateMatrix(profile, humanValues, actorWeight)` and the paired controller
carry actor weight separately from the complete human TRI vector. The plugin
never sends the scalar to a host morph setter. Human NIFs without TRI controls are
valid for weight-only or constant profiles. The UI labels its initial manual
weight 0.5 and the fixed neutral NIF geometry, which is not interpolated.
Even if a host model literally lists `$actor.weight`, that name is excluded from
editable TRI controls and source binding. It cannot satisfy an ordinary source
requirement or become a human write; the separate scalar remains the only input.
Imported fixture envelopes may include `actorWeight`; the `humanValues` map must
contain only actual morph coefficients.

Vanilla male/female share resource family `Vanilla` and version `game-weight-v1`,
with IDs `CLAW.VanillaMale.Weight1` and `CLAW.VanillaFemale.Weight1`. Family identity
is the family/sex pair, so both may coexist without allowing duplicate same-sex
profiles. This is a scalar conversion preview, not proof of game capture or final
visual differences between neutral weight geometry endpoints.
All five current canonical profiles require an explicit actor weight. The three
human-morph families add their weight contribution around neutral weight 0.5;
the two Vanilla profiles derive their body variation from weight. Dev.5 appends
the human-trait rules below to all five families.

## Human-only FaceGen and stature observations

`evaluateMatrix(profile, humanValues, actorWeight, humanTraits)` and the paired
controller accept `humanTraits` separately from body TRI coefficients. The exact
supported source names are `$human.face.noseLength`, `$human.face.jawWidth`,
`$human.face.jawForward`, `$human.face.chinWidth`, `$human.face.chinForward`
(shared kind 2) and `$human.height` (kind 3). Both reserved namespaces reject
unknown/noncanonical names as sources and every reserved name as a target,
including on omitted edges. Face values are signed finite float32 except the
engine's default sentinel; height is a positive finite ratio. The shared C++
exports enforce these domains.

Object-key presence denotes availability: `{}` is unavailable; a present face 0
or height 1 is explicitly available neutral data. Unavailable channels use
`source_neutral(kind)` from WASM, face 0 and height 1. Evaluation returns the
validated `humanTraits` object and `unavailableTraits` array. No missing entry is
inserted into the available input map. This mirrors native arithmetic while
preserving the distinction from observed neutral data. The plugin does not
capture the game itself or invent provenance for manually supplied values.

The UI's availability checkboxes/numeric fields and JSON input edit this separate
object. An imported fixture envelope preserves it. A diagnostic coefficient
snapshot exports it and the missing-channel array alongside the body/weight
inputs. A wolf-matrix preset remains an actor-independent policy and exports its
rules rather than freezing these inputs into a preset.

Human models with zero TRI names remain valid for actor/human-scalar profiles.
Reserved names returned by a host model are excluded from body controls and
cannot satisfy an ordinary morph source or become a special human setter call.
The body-only preview does not render FaceGen/sculpt or racial height. Canonical
comparison receives the identical human-trait object as the edited matrix.

## Preset formats and installed configuration

Wolf JSON uses `{schemaVersion:1,kind:"claw-wolf-matrix",profile:{...}}`.
Native XML uses `MorphLinkProfiles` schema 1 with `Profile` elements and optional
`Defaults`. Both imports validate all supplied profiles before selecting the
exact declared ID/family/version/sex. Defaults, when present, must reference an
existing profile of the corresponding sex. Unknown fields and DTD/entities fail.

A standalone export may contain one profile. A full game configuration exports
exactly one male profile (HIMBO or Vanilla) and one female profile (CBBE, 3BA or
Vanilla), with explicit defaults. It omits unselected families. An edited profile must
be selected for export; the tool never silently replaces it with another family.

Dev.5 consumes the pinned native family mappings for muzzle shape and the
explicit stature analogy for head/ear size, tail length and both claw lengths.
It also consumes the revised breast gains for the larger v3 resource field.
Actual target geometry must be present in the selected wolf NIF/TRI; this plugin
does not bundle or generate it. Ear tilt, tail posture/fluff, colour and physics
are not new preview simulations. This candidate still requires its own browser,
rendering and game acceptance.
