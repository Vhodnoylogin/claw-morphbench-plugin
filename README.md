# CLAW human/wolf comparison — Morphbench plugin

This development branch builds **0.4.0-dev.12**, the sparse-matrix, actor-weight and human-trait candidate.
The published 0.3.0 source baseline remains on `main`. Dev.12 puts human sliders,
the immediately editable matrix and Export/Import matrix in that order. Resource
configuration and diagnostics are collapsed; valid edits immediately update both
previews without Calculate/Apply/Live controls. The shared evaluator and host API
are unchanged. Replacement additionally preflights the retained full human input
vector before retiring a working model. The packaged consumer passes 55 public-SDK
harness checks; rendered-browser acceptance is recorded separately.
This candidate also adds
model-validated custom targets, near-zero edge omission, Vanilla weight-only
profiles for both sexes and independently selected male/female game XML;
it now reads explicit human FaceGen/stature observations separately from body TRI
coefficients. Dev.10 pins CLAW `394fa8d` and its seven-profile 0.8 catalog, including
BHUNP 3.34 Advanced Ver4 and classic UNP Renewal 4.6. The native/WASM kernel shares reserved
source validation and unavailable-input neutrals, and every family includes the
authored head/ear/tail/claw links. No model assets, colour renderer or physics
simulation are bundled with this plugin.

**Published download:** stable **0.3.0** is a [Miscellaneous file on the main CLAW page](https://www.nexusmods.com/skyrimspecialedition/mods/194798?tab=files&file_id=830298).
The old standalone Nexus page 197517 was permanently deleted on 1 November 2026
after owner confirmation. The file requires Morphbench Application **0.8.7** or
later with its matching Launcher; a current installation uses Launcher v3.
The exact stable ZIP remains 131,570 bytes, SHA256
`0c999ae234a11a846cb8cb8a2f2fb9990e1178cf0be8c766ec17ca2e5c2b6c25`.
Its [0.3.0 changelog](src/main/resources/nexus/changelog-0.3.0.txt) is saved on Nexus.

The stable package opened in the actual released Application 0.8.7 browser using
runtime v3: published CLAW 0.7.0.0 wolf resources and HIMBO opened as a pair, and
124 MMuscular human inputs were applied to 15 wolf outputs. A
[genuine screenshot](https://staticdelivery.nexusmods.com/mods/1704/images/194798/194798-1793527093-869173617.jpg)
was captured. These observations qualify that stable workflow; the current
development candidate has its separate scoped checks below. See
[publication status](src/main/resources/nexus/README.md).

This independent CLAW tool opens a human body and a wolf body in two host-rendered
preview panels. One full human morph vector controls the human preview and the
editable many-to-many CLAW conversion. Wolf coefficients are derived and read-only;
there is no inverse conversion. Rotating either panel follows the other through
the host's native orientation link. Dev.7 links zoom through optional public
scoped view methods; pan and framing remain independent.

The retained local qualification baseline is
[Morphbench Application 0.8.5 and Launcher v1](https://github.com/Vhodnoylogin/morphbench/releases/tag/v0.8.5).
The exact checked Application ZIP has SHA256
`c24ab0f44431b4bff0d3ed5f708ede4a30523f724bed96c5d42e894383b10f19`.
See its pinned [API contract](https://github.com/Vhodnoylogin/morphbench/blob/v0.8.5/docs/addons.md)
and [WASM contract](https://github.com/Vhodnoylogin/morphbench/blob/v0.8.5/docs/addon-wasm.md).
The plugin requires the documented independent-preview and packaged WebAssembly
capabilities; a version number alone is insufficient. Scoped geometry and
parent-window downloads are optional capabilities. Stable Application 0.8.0 is
insufficient. There is no separate JavaScript formula fallback: every calculated
coefficient uses the shared compiled kernel. Root Builder is optional for the
host's MO2-managed root deployment; separate Python and Blender are not needed.
The current released host is Application 0.8.8 with Launcher v3. The stable
0.3.0 browser check above is separate from this branch's retained 0.8.5/0.8.6
qualification; it does not qualify later candidates by inheritance.
The dev.4 package additionally passed 22 protocol/UI-harness checks using the
actual released 0.8.6 SDK and scripts extracted from its ZIP. A separate actual
0.8.6 browser run, using Launcher v2's Python and vendor libraries in isolated
settings, opened and applied Vanilla female and HIMBO male pairs. Both exported
vectors match the native CLI bit-for-bit; a browser-exported pair of Vanilla
matrices passes native parsing. This does not certify Launcher installation,
its native window, Nexus availability or game behavior.
Dev.6 passes 138 offline checks, including 23 checks against that released
0.8.6 SDK with the packaged plugin scripts, 50 native/WASM human-trait parity
cases, 256-edge capacity boundaries and six retained actual-input vectors.
Capacity comes from the shared kernel exports. The current catalog includes
separate biceps/triceps targets while arbitrary model targets remain supported.
These checks provide no new browser-rendered acceptance; the historical dev.4
browser observations do not qualify the revised candidate.

Recorded local 0.3 browser checks on 31 October opened male/female pairs, applied real
thin/muscular vectors, rotated both directions, downloaded an 18,837-byte matrix,
and read/exported every current/rest/delta position (14,597 human and 99,909 wolf
vertices in the male check). These are untextured fixed-NIF observations, not
game or artistic acceptance. The earlier filechooser timeout remains a browser
automation limitation; a text-paste import is provided without a native picker.
Further actual browser checks imported a constant matrix, edited a gain from
1 to 0.8, and downloaded the edited JSON and full game XML. The native CLI
accepted that XML and matched all 28 male preview targets with no human input.
Changing the human from thin to muscular preserved the wolf's entire 99,909-vertex
model exactly, including current/base/delta arrays and actual coefficients.
Both complete approximately 16.2 MB geometry snapshots were downloaded through
the parent service while the plugin displayed only a 32 KiB text page. Those
observations do not establish browser or game acceptance of the new sparse candidate.

This tool installs or edits no game, MO2 profile, Distribution DLL, human preset,
texture or skeleton. It imports no Morphbench backend, private renderer or DOM.
It is a separate plugin ZIP, not part of either CLAW game package. The host SDK,
manifest filename `addon.json` and its keys keep Morphbench's public names.

## Repository and shared dependency

This is the independent [CLAW Morphbench plugin repository](https://github.com/Vhodnoylogin/claw-morphbench-plugin).
It contains this browser plugin, its tests and publication artwork. CLAW's game
DLL, body authoring and runtime belong to [CLAW - Customizable Lycanthrope Appearance and Weight](https://github.com/Vhodnoylogin/claw).

`dependencies.json` pins the exact shared C++ evaluator and MorphLinks.xml to
one committed CLAW feature revision, with per-file SHA256.
They remain external build dependencies; there is no copied C++ evaluator or
alternative conversion formula in this repository. The builder accepts
`--claw-source-dir` for exact matching local files, or downloads the three pinned
raw files into ignored `target/dependencies/`. Every file is verified before use.
A newer local checkout is accepted only when those three files match the pins.

Production source is under `src/main/morphbench-plugin`, tests under
`src/test/morphbench-plugin`, and authored media/publication text under
`src/main/resources`. All generated files and dependency caches belong in ignored
`target/` or an external build directory. See [preserved history](docs/history.md).

## Use

1. In Morphbench 0.8.8, put the plugin ZIP or folder in `Morphbench/plugins`.
   New plugins are discovered and enabled automatically; open the **Plugins** menu
   to check its state and select **Open workspace**, or select its coloured tab.
   **Load and enable** accepts a package at another path. Updating the same ID
   requires disabling it, using the manager's update operation, and enabling it
   again. The shared-kernel plugin
   retains the existing ID `claw-human-link-dev-001`; this branch uses `0.4.0-dev.12`.
2. Declare the actual human resources: **HIMBO 5.8 male**, **CBBE 2.0.3 female** or
   **3BA 2.48 female**, **BHUNP 3.34 Advanced Ver4 female**, **classic UNP Renewal 4.6 female**, or **Vanilla male/female**. Select the exact human and wolf catalog entries and click
   **Open comparison pair**. The plugin opens no models automatically.
3. Import a full human coefficient JSON, a retained evidence-fixture JSON with
   `humanValues` and optional per-name provenance, or a BodySlide preset XML.
   Review the human controls and the read-only wolf calculation.
4. **Human morphs** is the primary panel: each named slider and number field
   immediately updates the human and derived wolf previews. There is no
   Calculate/Apply button or live-mode switch. A validated pair also receives the
   retained inputs when it opens or successfully replaces one side.
5. Edit the **Human → wolf matrix** directly below the sliders. Valid coefficient
   and function edits update immediately. **Export matrix** and **Import matrix**
   sit directly underneath it. Model settings, human presets/traits, game XML and
   numeric/vertex diagnostics are collapsed secondary controls. Invalid edits or
   imports preserve the last valid matrix and working pair. A temporarily blank
   numeric field remains editable and is never treated as zero.

Changing body family keeps the entered human vector until you explicitly reset it.
If the new model lacks a retained input, the error opens **Human presets, weight
and other inputs** and points to **Reset human morphs**. That button clears body
coefficients and their provenance, immediately updates an open pair, and preserves
the matrix, actor weight and face/stature inputs. Advanced JSON editing is not
needed to recover.

On a host advertising `models.selection.subscribe`, **Left model list replaces**
selects Human or Werewolf. Choosing a mesh in the host's left sidebar replaces only
that side, retaining the other preview, edited matrix and input values. A replacement
is validated before the old model closes; an unreadable or incompatible model keeps
the current pair. Successful replacements immediately receive the retained inputs
and matrix. Family/sex remain explicit declarations, never inferred from filenames.
Picking an already open resource leaves the pair unchanged. The optional
`previews.create.before` host feature preserves its original panel position.
Older hosts retain the plugin's explicit resource selectors; their main model list
still performs a full-page navigation, so use those plugin selectors instead.

**Actor weight** is a separate normalized 0..1 scalar. Its initial 0.5 is a manual
preview default, not a measured game value. A matrix can reference `$actor.weight`
without requiring that name in a human TRI. Vanilla profiles
`CLAW.VanillaMale.Weight1` and `CLAW.VanillaFemale.Weight1`, family `Vanilla`,
version `game-weight-v1`, use this scalar and can open a human NIF with no morphs.
The same scalar is available to mixed HIMBO/CBBE/3BA/BHUNP matrices when explicitly
referenced. A required scalar cannot be omitted or silently replaced with zero.
All seven bundled canonical matrices reference it. The HIMBO/CBBE/3BA/BHUNP profiles
combine human morphs with an actor-weight contribution whose neutral reference
is 0.5; Vanilla and classic UNP body variation rely on weight, with the separate human-trait
rules described below.
It never multiplies already-effective human coefficients, writes a TRI slider,
or interpolates the fixed human/wolf NIF geometry. JSON fixture envelopes can
supply explicit `actorWeight`; the human `humanValues` map cannot contain actor
namespace fields. BodySlide coefficient weight remains an independent control.
When reconstructing one NPC from a BodySlide preset, set its coefficient weight
and actor weight to the same normalized value. Already-effective JSON is not
interpolated again. For a Vanilla NIF without TRI controls, use an empty human
vector `{}`; family changes preserve the supplied vector rather than discarding it.

**Human face and stature** are a separate `humanTraits` object. The supported
sources are `$human.face.noseLength`, `$human.face.jawWidth`,
`$human.face.jawForward`, `$human.face.chinWidth`, `$human.face.chinForward`
and `$human.height`. Native capture reads vanilla FaceGen record scalars and NPC
NAM6 times human racial height; custom RaceMenu face values, sculpt geometry,
reference scale and node transforms are not those channels. The
[native source contract](https://github.com/Vhodnoylogin/claw/blob/4c2cdd9da22be8cf9b1e702b99824e055e9aeaf3/src/main/docs/human-head-traits.md)
defines the exact reads and authored projection limits.

Use the numeric controls or JSON to supply captured values or declare preview
values. Each checkbox controls availability; a checked zero is an explicit
neutral observation/declaration, while an unchecked field remains unavailable.
The shared C++ kernel supplies arithmetic neutral face 0 and height 1 for missing
traits. The UI and coefficient snapshot list missing channels explicitly.
Import envelopes can contain `humanValues`, `actorWeight` and `humanTraits`.
The human body morph map rejects both reserved namespaces. Neither scalar nor
trait values are ever sent to a human TRI setter, even if a loaded TRI lists
their literal names. The body-only human panel does not render a FaceGen head or
change racial height. Wolf outputs use the supplied traits through the same
compiled matrix as native; head/body attachment and rendered quality still need
their own acceptance.

## Development UI workflow

Dev.7 shows a three-step resource → human-shape → conversion workflow, the public
host catalogue root and explicit pair/live/error states. Human sliders and the
read-only wolf comparison are separated; the conversion matrix is visible and
has a direct action beside Apply and its own Apply matrix to previews button
with draft/applied status. On narrow frames each edge becomes a labeled card;
the wide editor remains a table. Actor weight is visible beside Apply; raw JSON and face/stature authoring
remain under Advanced human inputs. Body resources are external: choose the
folder in Morphbench's host model browser/launcher, then refresh this plugin's
catalogue. The plugin cannot select a new root through API v1 or install bodies.

The host's native link synchronizes orientation. Dev.7 additionally synchronizes
zoom through the public scoped view events/get/set when those capabilities are
available. It uses owned handles, event revisions, generation checks and coalesced
requests; orientation followers and matching command acknowledgements are not
replayed. Pan and framing remain independent. A zoom failure pauses only the
camera link and reports an error; it does not clear morphs or another preview.
Host navigation tabs and frame replacement remain Morphbench responsibilities.
On 1 November 2026 the exact dev.7 package
`a2f37e66949ecefc12e167c4ed0fcd1c35fa25648a2bb827a30158e443943982`
was checked in the actual reviewed Morphbench Application 0.8.8 candidate
`2670d86eaf9013aed025b9dbc4a782b9c6e89b4efdb5f6f8f21ac4ebd7f3cd26`,
using official Launcher v3 libraries and isolated copied resources. The common
plugin tab opened, Unicode and narrow matrix cards rendered correctly, editing
gain edge 117 to 0.25 paused live updates and marked a draft, and the local
matrix Apply changed the wolf. Reselecting the active host tab retained the
matrix. Resource selection blocked Apply and closing the pair worked. The
subsequent inactive-pair status-label correction has a focused SDK regression;
it does not change binding or calculation semantics.

Actual released 0.8.7 browser checks on the earlier dev.7 package
`44fc5b6a8bb8d983841fa09e8ec6bfd9044aaaf044a60aadf81c5aad59dadde3`
confirmed bidirectional wheel zoom and rotation, human and wolf renderer changes
for thin/muscular inputs and ArmsBiceps edits, and all 24 mapped MThin outputs
matched independent native float32 values. The six additional native zero keys
are outside the sparse matrix, rather than lost outputs. The zoom controller
is unchanged in the 0.8.8 UI check, but a new zoom interaction on that host is
not claimed by these observations. These are scoped browser and numerical
checks, not game, colour, physics, artistic quality or public-release acceptance.
Stable 0.3.0 remains the public download; dev.11 is unfinished feature-branch work.

Dev.11 fixes the sidebar workflow with the additive development-host selection
subscription. It stages one replacement before closing the selected side, preserves
the other handle and its coefficients/camera, and retains the edited matrix and
human inputs. Already-sent paired writes complete on their old handles; queued
unsent vectors are revoked. Failed candidates keep the old pair. Known absent or
acknowledged closed previews retire their historical ownership ledgers.
Optional placement keeps Human and Werewolf on their original sides.
The exact dev.11 package passed 43 public-SDK/consumer harness checks, including
retained real inputs, plus 42 controller and 17 pair-state checks. These are
protocol/lifecycle tests, not a new actual-browser or game acceptance. The shared
kernel and committed seven-profile catalogue are unchanged. The sidebar features
are development-host additions; released Application 0.8.8 lacks those optional
capabilities and retains its original main-list navigation behavior.

Dev.9 fixes pair authority at the UI boundary. Selecting another resource revokes
the previous pair immediately and closes its owned previews after sent requests
finish; unsent wolf writes and queued vectors are revoked. Refreshing a catalogue with a
missing resource or a changed root also closes that pair, even if filenames match.
The human vector and edited matrix remain local for explicit reopening. Human
controls cannot issue live writes during a preview operation. If a fixture's
family transition is refused, the import preserves the previous inputs and matrix
and reports the error instead of accepting coefficients under the wrong family.

On 2 November 2026 the exact dev.9 ZIP
`2459f854dd800630fb84ac975fc9cd5c9cd8e09fc5b5c612f25405ee423c241a`
(205,251 bytes, ten browser assets) was checked in released Application **0.8.8**
with Launcher v3 libraries and isolated copied resources. The folder plugin loaded
automatically into its host tab; disable/enable, reopening and repeated selection
worked. HIMBO and CLAW 0.8 wolf resources opened as a pair. Rotation and wheel zoom
followed either panel. Human ArmsBiceps=2 changed both actual models. Editing its
matrix gain to 0.25 changed the wolf output from 1 to 0.5; JSON export, restore,
pasted import and Apply preserved that edit. Changing the function to power also
applied and calculated 0.25. Two complete geometry exports retained 14,597 human
and 99,909 wolf vertices each. All 30 native output slots matched actual preview
coefficients bit-for-bit for the canonical and edited XML; the edited matrix
changed wolf geometry while leaving the human model unchanged. Browser-exported
game XML was accepted by the native parser. Resource changes removed the old pair.

The packaged consumer passed all 37 tests against the released 0.8.8 SDK with real
fixture inputs, plus 28 controller and 16 pair-state checks. Fourteen builder checks
and 59 kernel/input/matrix checks also passed; numerical assets are byte-identical
to that independently tested package. Native/WASM conformance includes 202 generic,
48 weight, 55 trait and 98 BHUNP cases, ten sparse cases and the 256-edge boundary.
This qualifies the listed browser and numerical scenarios, not every body family,
textured appearance, physics, game behavior or a new public release. The shared
evaluator and its six-profile dependency pin were unchanged at that checkpoint.
Classic UNP was awaiting the committed upstream catalogue pin added in dev.10.

Dev.10 consumes the committed `394fa8d` catalogue and adds **UNP Renewal 4.6
(classic)** as an independent female family. Its 41 ordered rules match the
Vanilla female weight/face/stature policy. It has no invented ordinary BodySlide
sources and is separate from BHUNP. Its human NIF can have no TRI; enable the
host's **and without morphs** catalogue option. Actor weight is now visible beside
Apply for every family, and a model without TRI controls explains which inputs
remain available. Human neutral geometry stays fixed at the selected NIF.
Custom source/target names in authored matrix presets remain supported; selecting
UNP for game XML exports it independently of the male family.

The exact dev.10 ZIP
`95cd690ba36e69c731a077bd2d6eb953321f97b84b2b3581aa33f15793ede9ac`
(210,125 bytes, ten browser assets) passed scoped actual Application 0.8.8 browser
checks with a copied classic UNP NIF and CLAW female NIF/TRI. It opened with zero
human TRI controls and applied 19 wolf targets. Weight 0 and 1 exports each retained
all 6,850 human and 99,023 wolf vertices; all 31 native output slots matched actual
preview coefficients bit-for-bit at both weights. Wolf geometry changed; human
geometry correctly stayed fixed. Browser-exported UNP/HIMBO XML parsed natively,
and importing that XML back through pasted text restored the 41-edge UNP matrix.
Six previous catalogue profiles and the compiled shared kernel remain identical.
Sixteen builder checks, 63 pure/native checks (including 25 UNP weight/trait cases),
38 actual packaged-SDK checks, 28 controller and 16 pair-state checks passed.
This is browser/numerical acceptance, with no game or texture/physics claims and
no new public release. Earlier dev.9 HIMBO observations retain their exact scope.

Dev.8 adds the independently measured BHUNP matrix to calculation, model binding
and game XML export. It requires a BHUNP 3.34 **Advanced Ver4** body and matching
TRI generated with **Build Morphs**. Classic UNP is a different body. The matrix
uses actual BHUNP source names, including its Low/High controls; it is not a CBBE
alias. Raw RaceMenu/TRI-positive `Arms`, `Legs` and `Breasts` shrink those regions,
even though BodySlide's baked inverted controls can appear to run the other way.
The preview consumes effective TRI coefficients, without a second inversion.
Offline native/WASM and public-SDK checks do not establish actual BHUNP mesh,
browser-rendered or game acceptance. The dev.7 observations above remain scoped
to their exact older artifacts.

## Wolf presets are coefficient and function matrices

Open **Wolf preset — coefficient and function matrix** to edit ordered sparse
human-source/wolf-target edges. Each edge has a gain and a function. One cap is
shared by every edge to the same target; changing a cap updates all those edges.
Add source or constant edges, remove them, and change their accumulation order.
Morph names use printable ASCII identifiers and preserve their authored spelling.
SKEE provider identity folds ASCII A–Z to a–z: case-only source/target aliases
and folded source/output collisions are rejected. Sources repeated with the same
spelling across different edges remain valid. Target names come from the loaded wolf model;
there is no body-part or sex-specific name whitelist. With a pair open, edits and
imports reject missing target names without replacing the last valid matrix.
The controller validates both model domains again before writes.
An absent edge contributes zero. After float32 normalization, gains with
`abs(gain) <= 1e-6F` are omitted before duplicate/cap/capture checks. `linear` is
the default function and is omitted from serialized presets. Invalid structural
fields still fail on inactive edges. Active duplicates, inconsistent target caps,
source/target name intersections and nonfinite numbers are rejected.
An empty matrix is valid; applying it clears only previously acknowledged outputs.
Valid matrix edits update both previews immediately. Numeric edits retain focus
and zero-gain rows while typing; the shared evaluator and exported policy still
normalize/prune inactive edges. New unavailable custom body sources are rejected
for a bound pair; intentionally absent canonical sources retain their existing
zero-input semantics. Lifecycle operations lock all matrix mutations.

The function set is `linear`, `positive`, `negative`, `smoothstep`, `power`
(integer exponent 1..8, preserving input sign) and `constant` (empty source with a
finite value). Exact arithmetic is defined by the shared evaluator's
[sparse matrix contract](src/main/morphbench-plugin/docs/sparse-matrices.md). Every target's contribution
details show original input, transformed input, gain and contribution.

**Export wolf preset JSON** preserves the complete matrix: profile ID, resource
family and version, sex, calibration, ordered edges, gains, caps, functions and
their parameters. The file envelope is
`{schemaVersion:1,kind:"claw-wolf-matrix",profile:{...}}`. This preset preserves
the conversion policy independently of actor inputs. Coefficient snapshot exports
separately retain `humanValues`, `actorWeight`, `humanTraits` and
`unavailableTraits`. Matrix import accepts the policy JSON
or generated native `MorphLinkProfiles` XML, through a file or pasted text.
XML keeps the native plain-ASCII/no-entity/no-declaration restriction; delimiter
characters supported by JSON receive an XML export error. Select the matching
human family before importing one. Import validates ID/family/version/sex before
replacing the current matrix. Pasting the same JSON into the matrix import box
avoids a native file picker. **Restore canonical matrix** discards local matrix
edits; it does not apply any coefficients. **Export mapping XML** produces the
native `MorphLinkProfiles` configuration with exactly one male profile
(HIMBO or Vanilla) and one female profile (CBBE, 3BA, BHUNP, UNP or Vanilla), plus explicit
defaults. Other families are omitted. Select the edited family for its sex before exporting so its edits cannot
be silently discarded. Standalone XML export can contain one profile.

The numeric comparison shows edited-matrix output against the canonical matrix
at identical human inputs. An optional diagnostic coefficient snapshot can replace
that reference; it is explicitly named `claw-wolf-coefficient-snapshot` and is
not a wolf preset. The table reports every target, signed difference, maximum
absolute difference and RMS. Missing reference targets use preview zero.

Exports expose all text through a bounded pageable viewer with a suggested UTF-8
filename. Small presets fit one page; large vertex snapshots retain the complete
text without placing a multi-megabyte value in the DOM. The qualified host's optional
`exports.prepare` service creates an
immutable download in the parent window, outside the plugin sandbox. A host
without that service retains text export; no hidden filesystem write or
undocumented host endpoint is used. Preparing a download does not establish that
the user has saved it. The host advertises its export byte limit; its default
1 MiB is enough for matrices, but full geometry needs an explicitly configured
larger limit (the CLAW development host uses 32 MiB). The complete retained text,
not just the displayed page, is sent for a download.

## Read all vertices and their deltas

The optional public `previews.geometry {preview,shape}` capability supplies
detached current `vertices` and initial/rest `baseVertices` for each shape.
**Read all vertices in both previews** reads every shape in the plugin's two
owned models and computes `current − base` per vertex. The table pages through
all vertices, including zero deltas. Its complete JSON export retains every
current position, base position and three-component delta, with model/shape
names, vertex count, maximum displacement and RMS displacement.

Positions are in model space and game units. Initial means the selected NIF's
rest position, not the current camera view or an interpolated weight endpoint.
The host's browser morph deltas are int16-quantized; this is not a runtime skinning
measurement. Shapes are read sequentially, not as an atomic multi-shape snapshot.
Each snapshot also records the actual morph names and coefficients of both
models. The plugin reads them again after the sequential shape reads and rejects
a snapshot if either vector changed. Preview changes invalidate the retained
snapshot and require a fresh read.
Hosts without the scoped geometry capability show an explicit unavailable state;
the plugin does not fall back to the unrelated main model's geometry.

The controls expose all names in the loaded human TRI, with a filter. Imported
human-only fields such as `Butt`, `BigButt` or `MuscleAbs` remain in the human
preview even when no current CLAW rule uses them. The UI reports those names and
their nonzero values separately from mapped output. It never silently filters a
full human vector down to the configured conversion-source subset.

Resource family and sex are explicit declarations; filenames and available
morphs cannot establish donor provenance. Changing family clears only previously
acknowledged wolf outputs. Changing sex requires reopening matching resources.
Changing a model selection disables Apply until that pair is explicitly opened.
Scene notifications do not automatically apply coefficients.

## Fixed geometry and two input modes

Each preview uses the selected **fixed NIF**. The extension has no neutral
low/high geometry-weight interpolation API. For a weight-100 comparison choose
the matching human `_1` and wolf `_1` resources. A weight-30/50 actor shown on
one endpoint has a known neutral-geometry mismatch; interpolating preset
coefficients does not repair it.

**Already-effective human JSON** is accepted as signed finite float32 numbers.
It is never multiplied by weight again, including when an imported fixture has
NPC-weight metadata. Omitted names use zero for this preview, not an assertion
that an unobserved game value was zero. Full fixture imports preserve per-name
provenance. A configured conversion-source capture is not a complete capture of
every human TRI name or preset slider; reconstructed preset values must retain
their separate provenance.

**BodySlide preset XML** supplies `small`/`big` percentage endpoints. The selected
preset's coefficients are normalized once and interpolated at the separate
0..1 coefficient-weight control, including exact endpoint selection at 0 and 1.
Missing endpoints default to zero. Signed and extrapolated coefficients remain
valid; unknown sizes such as `both`, duplicate endpoints, unsafe names,
nonfinite/overflowing values and DTD/entity declarations are rejected. Comments
and standard predefined/numeric escapes pass to the browser's XML parser. This
strict import policy does not reproduce every BodySlide/OBody dialect quirk.
Preview interpolation uses normalized float32 endpoints and weight, selecting
the exact endpoint when that weight is 0 or 1. Interior weights use the binary64
convex sum `low*(1-weight) + high*weight`, bounded to the endpoint interval,
then rounded once to float32. This avoids overflowing a float32 endpoint delta
or cancelling a tiny endpoint. It is a declared preview reconstruction policy,
not an observed SKEE aggregate or a claim of bit-identical runtime OBody arithmetic.

Independent neutral geometry would require
`V0 + weight*(V1-V0) + sum(effectiveCoefficient*TRIDelta)`. The selected fixed NIF
does not implement its weight term. The current XML examples with equal preset
coefficient endpoints therefore produce the same coefficients at every weight.

## Arithmetic and lifecycle

The `core.js` public evaluator validates and marshals inputs. It contains no
conversion formulas. The pinned `src/main/cpp/shared/MatrixKernel.cpp` is compiled into the
game DLL and separately into WebAssembly; `matrix-kernel.template.js` only
marshals its 28-byte rule ABI and reads results. The embedded WASM has no imports,
engine access, allocator or network calls. Composition uses float32 inputs/gains/caps,
binary64 function evaluation and accumulation in surviving rule order, then
`float32(clamp(sum,0,1)*cap)`. Cap multiplication follows clamping;
Actor weight is an explicit source only when the matrix references it. Its
reserved namespace and normalized domain are validated by the same C++ exports
in native and WASM. Negative target sums reach neutral. Opposed deformations
use explicit lean targets in compatible wolf resources and suitable source
functions; changing a gain does not invent a missing deformation.

The controller uses only explicit `previews.*` operations. Each immutable opaque
preview ID serves as its binding generation, alongside a local session epoch.
Both morph domains are validated before either write. Each host batch is atomic
within its own model; the two calls are **not** a cross-model transaction. A
partial or unknown write failure closes this plugin's pair and reports failure.
Failed cleanup retains exact owned handles for a retry. Another preview and the
main model are never cleanup targets. Closed/replaced sessions invalidate queued
work; unsent human vectors coalesce to the latest one.

The native `previews.link(..., properties:["orientation"])` handles rotation.
Optional zoom synchronization listens only to public scoped view events and
writes only `zoom` to the two validated owned handles. Revision/epoch checks,
acknowledgement suppression and coalescing prevent ordinary echo and stale-pair
writes. `pair.js` retains its independent tested camera/state foundation; no
host DOM or private renderer access is used.
Model loads, frame lifetime and renderer disposal remain the host's contract.

## Build and verify

From this repository with Python 3.12+, Node.js 22+ and clang with wasm32/wasm-ld support:

```powershell
python build.py --output-dir target/plugin --wasm-compiler '<external-clang.exe>'
# Optional offline dependency source: add --claw-source-dir '<matching-claw-checkout>'
python -m unittest discover -s src/test/morphbench-plugin -p 'test_*.py'
node --require './target/plugin/matrix-kernel.js' src/test/morphbench-plugin/core.test.cjs './target/plugin/catalog.json'
node --require './target/plugin/matrix-kernel.js' src/test/morphbench-plugin/pair-state.test.cjs './target/plugin/catalog.json'
node --require './target/plugin/matrix-kernel.js' src/test/morphbench-plugin/input.test.cjs
node --require './target/plugin/matrix-kernel.js' src/test/morphbench-plugin/preview-controller.test.cjs
node --require './target/plugin/matrix-kernel.js' src/test/morphbench-plugin/sdk-integration.cjs './target/plugin/catalog.json' '<host>/web/addon-sdk.js' '<external-real-pair-inputs>'
node --require './target/plugin/matrix-kernel.js' src/test/morphbench-plugin/matrix.test.cjs './target/plugin/catalog.json' '<native-claw-preset-tool.exe>' '<external-checks>' '<external-real-pair-inputs>/fixtures-full-preset-reconstruction.json'
node --require './target/plugin/matrix-kernel.js' src/test/morphbench-plugin/sparse.test.cjs './target/plugin/catalog.json' '<native-claw-preset-tool.exe>' '<external-checks>'
node --require './target/plugin/matrix-kernel.js' src/test/morphbench-plugin/weight.test.cjs './target/plugin/catalog.json' '<native-claw-preset-tool.exe>' '<external-checks>'
node --require './target/plugin/matrix-kernel.js' src/test/morphbench-plugin/human-traits.test.cjs './target/plugin/catalog.json' '<native-claw-preset-tool.exe>' '<external-checks>'
```

The builder reads the hash-pinned external `src/main/resources/profiles/MorphLinks.xml`,
validates supported-family subsets and defaults, and preserves surviving XML order.
The bundled canonical catalog offers four morphed human families, two
sex-specific Vanilla profiles and classic female UNP. Before packaging, Node.js validates every catalog
matrix against the actual generated WASM's reserved-source exports. It emits ten local browser
assets in a deterministic ZIP, with an external catalog and SHA-256 build report.
The SDK is loaded from the host and is never copied into the package. The host's
CSP blocks fetch/XHR, so the mapping is a classic local JS asset and imports use
the browser File API or explicit pasted matrix text. Clang with wasm32/wasm-ld
support is an external build dependency; no compiler is bundled. Use
`CLAW_WASM_COMPILER` as an alternative to the command-line option.

Tests cover arithmetic, scoped ownership, cleanup/closure races, partial failure,
latest-input coalescing, family/sex changes, source provenance, complete real
human fixture vectors and the unchanged actual SDK in a detached DOM/message
harness. That harness is not an actual browser, renderer or installed-host test.
The real fixture resources remain outside Git and are not redistributed.
Candidate fixture expectations are derived independently by the frozen native
CLI at explicitly retained historical weights. Original game observations and
human vectors remain unchanged; these new expected coefficients are offline
calculations, not new runtime observations.
Textured paired-model appearance, user rotation in the qualified host, game
assignment, physics and runtime skinning require their separate acceptance.
