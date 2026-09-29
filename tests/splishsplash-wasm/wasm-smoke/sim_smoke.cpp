#include <cmath>
#include <iostream>

extern "C" {
int sph_init(int side);
int sph_step(int steps);
int sph_particle_count();
float sph_center_y();
float sph_time();
int sph_all_finite();
void sph_destroy();
}

int main()
{
    const int count = sph_init(8);
    const float y0 = sph_center_y();

    if (count != 512 || !std::isfinite(y0) || !sph_all_finite())
    {
        std::cerr << "SPLISHSPLASH_SIM_WASM_FAIL init count=" << count
                  << " centerY=" << y0 << "\n";
        sph_destroy();
        return 20;
    }

    const int steps = sph_step(40);
    const float y1 = sph_center_y();
    const float time = sph_time();

    const bool ok =
        steps == 40 &&
        sph_all_finite() &&
        std::isfinite(y1) &&
        std::isfinite(time) &&
        time > 0.0f &&
        y1 < y0 - 1.0e-5f;

    if (!ok)
    {
        std::cerr << "SPLISHSPLASH_SIM_WASM_FAIL"
                  << " particles=" << count
                  << " steps=" << steps
                  << " y0=" << y0
                  << " y1=" << y1
                  << " time=" << time << "\n";
        sph_destroy();
        return 21;
    }

    std::cout << "SPLISHSPLASH_SIM_WASM_OK"
              << " particles=" << count
              << " steps=" << steps
              << " y0=" << y0
              << " y1=" << y1
              << " time=" << time << "\n";

    sph_destroy();
    return 0;
}
