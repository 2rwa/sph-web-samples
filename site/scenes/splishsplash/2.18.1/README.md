# Upstream SPlisHSPlasH scene snapshots

These JSON files are copied without semantic modification from upstream **SPlisHSPlasH 2.18.1** and are used as compatibility fixtures for the browser Scene JSON adapter.

Upstream repository:

- https://github.com/InteractiveComputerGraphics/SPlisHSPlasH
- tag: `2.18.1`

Fixtures:

- `CompressibleSPH_WCSPH.json`
- `DamBreakModel.json`
- `DoubleDamBreak.json`
- `CompressibleSPH_ICSPH.json`
- `CompressibleSPH_PF.json`

- `BucklingModel_Peer2015.json`

- `BucklingModel_Peer2016.json`

- `BucklingModel_Bender2017.json`

- `BucklingModel_Takahashi2015.json`

- `BucklingModel_Weiler2018.json`

- `SurfaceTension_NoGravCube_ZR2020.json`

- `SurfaceTension_DoubleDroplet_ZR2020.json`

- `SurfaceTension_BreakDamZR2020.json`

The browser adapter must preserve the original JSON meaning. If a browser-side bridge substitutes a desktop implementation detail, that substitution must be reported explicitly by the compatibility layer rather than silently rewriting the fixture.
