#include "SPlisHSPlasH/SPHKernels.h"

#include <cmath>
#include <iostream>

int main()
{
    constexpr SPH::Real radius = static_cast<SPH::Real>(0.1);
    SPH::CubicKernel::setRadius(radius);

    const SPH::Real w0 = SPH::CubicKernel::W(static_cast<SPH::Real>(0.0));
    const SPH::Real wHalf = SPH::CubicKernel::W(radius * static_cast<SPH::Real>(0.5));

    if (!std::isfinite(static_cast<double>(w0)) ||
        !std::isfinite(static_cast<double>(wHalf)) ||
        w0 <= static_cast<SPH::Real>(0.0) ||
        wHalf <= static_cast<SPH::Real>(0.0) ||
        wHalf >= w0)
    {
        std::cerr << "SPLISHSPLASH_WASM_SMOKE_FAIL"
                  << " radius=" << radius
                  << " w0=" << w0
                  << " wHalf=" << wHalf << "\n";
        return 2;
    }

    std::cout << "SPLISHSPLASH_WASM_SMOKE_OK"
              << " radius=" << radius
              << " w0=" << w0
              << " wHalf=" << wHalf << "\n";
    return 0;
}
