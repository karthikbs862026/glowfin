# Moon-Garden authored review sources

These assets were generated from the approved Concept-First Art Bible during
the owner-requested visual reset. All character, gate, architecture, reef,
skyline and ambient-life cards are retired from the runtime. Shared material
sources remain here while the final production GLB/PBR library is authored.
Version 30 generates validated runtime Glowfin, gate and reef packages into
`models/` during development and production builds. They preserve the Version
29 world while proving the skinned character, five clips, family silhouettes,
material separation and reef signatures through the real compressed-GLB path;
they do not constitute final external DCC sculpt approval.

| Asset | Runtime role | Production replacement |
| --- | --- | --- |
| `moonstone-seabed.webp` | Organic gravel/silt Moon-Garden floor albedo | Retain as atlas candidate after seam/material review |
| `moonstone-surface.webp` | Triplanar hand-painted weathering on real ruin and reef volumes | Retain after final authored GLB/material bake |
| `living-reef-surface.webp` | Triplanar porous tissue and restrained emissive-vein breakup on living reef vertices | Retain as living-material atlas source |
| `glowfin-surface.webp` | Seamless sea-glass skin pigment, fine pores and violet freckles on the skinned Glowfin mesh | Retain as final character-material source |

All four runtime images have a maximum dimension of 512px, contain no text or
third-party marks, and together add about 0.16 MB compressed. Retired concept
plates remain in `docs/art/` as art-direction evidence but are no longer copied
or loaded as game objects.

The source prompts required Moon-Garden blue-grey stone, restrained shell-gold,
living cyan/violet/rose reef accents, rounded manta/nautilus forms, and the
approved rear-view axolotl-puffer Glowfin. They explicitly prohibited generic
Atlantis architecture, paved roads, repeated mandalas, cone coral, detached
neon bars, white plastic character materials, text, logos and watermarks.

Obstacle proportions cycle through five stable variants stored in the runtime
gate GLB. Volumetric reef and ambient-life families use world-band indices so
adjacent segments do not repeat and recycling cannot make an asset pop to
another variant.
