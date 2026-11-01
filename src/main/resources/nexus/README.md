# Nexus publication source

The stable **0.3.0** plugin is now a **Miscellaneous** download on the main
[CLAW page](https://www.nexusmods.com/skyrimspecialedition/mods/194798?tab=files&file_id=830298),
file **830298**. The previous standalone page **197517 was permanently deleted**
on 1 November 2026 after the owner explicitly confirmed the deletion. Nexus
redirected to the game landing page. This location change does not merge the
game and plugin source repositories or change the plugin ID.

The 0.3.0 changelog is saved on file 830298; its exact capability and compatibility
text is maintained in `changelog-0.3.0.txt`.

The file has mod-manager downloads and the requirements popup enabled. Its one
per-file requirement is **Morphbench Application, minimum 0.8.7, maximum Latest**.
The CLAW game file retains its own seven requirements; installing the offline
plugin does not add a gameplay dependency.

The exact existing plugin ZIP contains ten runtime browser assets, **131,570 bytes**,
SHA256 `0c999ae234a11a846cb8cb8a2f2fb9990e1178cf0be8c766ec17ca2e5c2b6c25`.
The preserved ID is `claw-human-link-dev-001`, API version 1. No new archive,
matrices or runtime code were built for this move. Only catalogue provenance differs
from the earlier browser-qualified 0.3.0 archive
`7afa4a3f0fe48fae8df3dfb0cb8da86f5fad28a48f7635d212cbae8041f8e835`;
all nine other members, coefficients, evaluator and embedded WASM are byte-identical.
Generated ZIP files and dependency caches remain outside Git.

## Current browser check

On **1 November 2026**, the exact stable package was opened in the actual released
**Morphbench Application 0.8.7**, using runtime v3 and isolated settings. A pair using
HIMBO 5.8 and the published CLAW 0.7.0.0 wolf body opened, and all **124** human values
from MMuscular were applied to **15** wolf outputs. A fresh screenshot was captured:

https://staticdelivery.nexusmods.com/mods/1704/images/194798/194798-1793527093-869173617.jpg

This is a browser workflow check, not new game, physics, textured-rendering or
unfinished 0.4 development acceptance. The previous 0.8.5 checks remain historical:
male 124 human inputs / 15 outputs, female 154 / 16, linked rotation, matrix export
and full vertex reads. The independent-repository build previously passed 98 checks;
remote and matching local dependency builds produced byte-identical archives.

## User-facing material

`file-description.txt` is the short developer-download description. The main CLAW
page includes the plugin's purpose, setup steps and screenshot. Its exact saved BBCode
is maintained in the CLAW source repository under
`src/main/resources/publication/nexus/0.7.0.0/description.bbcode.txt`.
`description.bbcode` retains the longer standalone-page reference text with its new
location notice. It is not a second active mod page.

For a current installation use Application 0.8.7 with Launcher v3. API v1 independent
previews and packaged WebAssembly support are required; API version alone is
insufficient. Supply your own matching HIMBO/CBBE/3BA human and CLAW 0.7.0.0 wolf
NIF/TRI resources. Separate Python, Blender, RaceMenu, OBody and a running Skyrim
are unnecessary for the offline calculation. Host install prerequisites remain
owned by Morphbench.

No donor bodies, textures, SDK, game DLL, compiler, sources archive or development
candidate is shipped inside this plugin ZIP. Original permissions remain unchanged.
