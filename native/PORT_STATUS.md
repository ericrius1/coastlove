# Native port scope

This is a playable native implementation alongside the existing browser game. It is not yet a feature-for-feature replacement of the original renderer and simulation.

## Carried across

* All 56 authored destinations, real California DEMs, San Francisco and Los Angeles building footprints, street networks, and far city skylines.
* The original procedural harbor, coastal towns, landmarks, Golden Gate Bridge, stunt ramp geometry, boat, roadster, seaplane, nine resident figures, and six wildlife species.
* All resident story pages and six sequential Tide Letters, including time windows, quiet observation, the bell interaction, saved progress, and a readable journal.
* Native boat, plane, walking, swimming at the water surface, and driving controls; atlas travel; fishing and saved catches.
* Local field-recording playback, habitat/day/night/altitude mixing, footsteps, engine/water layers, and synthesized bell/discovery sounds.

## Native replacements

The renderer uses camera-relative instanced art, bounded terrain and displaced-ocean clipmap rings, four-cascade 256² JONSWAP/Tessendorf ocean compute, geometric waves, filtered spectral normals, depth-aware refraction/absorption, screen-space water reflections, shoreline foam, atmospheric sky, 3072 px filtered sun shadows, depth contact shading, 4× MSAA with foliage alpha-to-coverage, and restrained HDR glow/tone mapping. Water phase stays continuous as the floating origin moves across California.

The native build reuses the original web leaf atlas, broadleaf/palm/fern/shrub meshes, and weathered wood/stone/roof PBR texture bakes with full mip chains. Native conifers have smooth tapered trunks, woody limbs, and feathered alpha-tested foliage; town groves use these detailed models too. Near/far geometry, mip-aware leaf coverage, front-to-back forest draws and a separate shadow LOD limit GPU cost. Buildings and terrain now cast sun shadows. City cells continue streaming on background workers. Native vehicle and wildlife controllers remain independent implementations.

## Remaining fidelity work

The local shore simulation, underwater reef ecosystem, volumetric atmosphere, temporal antialiasing, full boat hydrodynamics, traffic AI, animated glTF resident characters, detailed fishing economy, and the original car stunt/drift model are not ported. Native material shading uses the original texture bakes with a compact GGX model; it does not yet reproduce every specialized web material layer. The sky is analytic rather than the web atmosphere LUT/volumetric system. Screen-space reflections fall back to the sky when reflected geometry is outside the view. Forest geometry currently extends 1.5 km; the 48/72 km preset distances refer to terrain and city skylines. Lighthouse beams need a dedicated native effect; the six letter sites do activate their little lights as the mystery progresses. Wildlife animation and movement are simpler. Browser saves are not automatically imported.

These differences matter when evaluating performance: a faster native frame currently draws and simulates a different mix of effects. Performance results must identify the scene, quality preset, resolution, and included features. Windows source compilation and local Mac GPU validation do not substitute for a Windows hardware playtest.
