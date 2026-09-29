# WebGPU Deep-Dive Experiments

Five derivative experiments extend the six examples3d ports beyond direct visualization.

## Basic quality ladder
Rebuilds the atomic density volume at 32 cubed, 48 cubed, or 64 cubed. Each preset also changes render scale and fixed ray step. This makes the compute-volume / raymarch-quality tradeoff directly observable.

## Faucet velocity surface
A second atomic accumulator stores weighted particle speed. The normalize pass reconstructs weighted-average speed per voxel. The implicit surface samples this volume and maps slow-to-fast regions from blue to orange/red.

## Custom-force slice explorer
The fluid remains a 3D density surface. A movable Z plane evaluates the same analytic plus/minus X force sources as the Rust NonPressureForce implementation. The plane displays relative source strength, combined magnitude, and logarithmic magnitude bands.

## Height-field cutaway
The fluid is clipped at a movable Z plane. That plane samples the original unclipped density texture and compares Y with the analytic terrain height, exposing fluid interior and terrain profile together.

## Elasticity material metrics
The two elastic bodies are measured independently. Reset-time bounding-box extents are used as the reference. Current extent ratios, extent-volume ratio, center of mass, RMS speed, and maximum particle speed are displayed. The history chart plots the two extent-volume ratios.

Bounding-box ratios are diagnostic proxies and are not continuum strain tensors.
