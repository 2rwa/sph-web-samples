#include <cmath>
#include <iostream>

extern "C" {
int sph_init(int side);
int sph_init_dambreak(int resolution);
int sph_step(int steps);
int sph_particle_count();
int sph_boundary_count();
int sph_point_set_count();
int sph_boundary_point_set_index();
int sph_boundary_neighbor_links();
float sph_center_y();
float sph_min_y();
float sph_max_x();
float sph_time();
int sph_all_finite();
void sph_destroy();
}

int main()
{
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
    }

    {
        const int count = sph_init_dambreak(6);
        const int boundaryCount = sph_boundary_count();
        const float initialMinY = sph_min_y();
        const float initialMaxX = sph_max_x();
        const int pointSets = sph_point_set_count();
        const int boundaryPointSet = sph_boundary_point_set_index();
        const int initialBoundaryLinks = sph_boundary_neighbor_links();

        std::cout << "SPLISHSPLASH_DAMBREAK_DIAG_INIT"
                  << " pointSets=" << pointSets
                  << " boundaryPointSet=" << boundaryPointSet
                  << " boundaryLinks=" << initialBoundaryLinks
                  << " boundaryParticles=" << boundaryCount
                  << " minY=" << initialMinY
                  << "\n";

        if (
            count != 432 ||
            boundaryCount < 1000 ||
            pointSets < 2 ||
            boundaryPointSet < 1 ||
            !sph_all_finite() ||
            initialMinY < 0.05f)
        {
            std::cerr << "SPLISHSPLASH_DAMBREAK_WASM_FAIL init"
                      << " particles=" << count
                      << " boundary=" << boundaryCount
                      << " pointSets=" << pointSets
                      << " boundaryPointSet=" << boundaryPointSet
                      << " boundaryLinks=" << initialBoundaryLinks
                      << " minY=" << initialMinY << "\n";
            sph_destroy();
            return 30;
        }

        const int firstSteps = sph_step(30);
        const int linksAfter30 = sph_boundary_neighbor_links();

        std::cout << "SPLISHSPLASH_DAMBREAK_DIAG_STEP30"
                  << " steps=" << firstSteps
                  << " boundaryLinks=" << linksAfter30
                  << " minY=" << sph_min_y()
                  << " time=" << sph_time()
                  << "\n";

        const int finalSteps = sph_step(290);
        const float minY = sph_min_y();
        const float maxX = sph_max_x();
        const float time = sph_time();

        const bool ok =
            finalSteps == 320 &&
            sph_all_finite() &&
            std::isfinite(minY) &&
            std::isfinite(maxX) &&
            std::isfinite(time) &&
            time > 0.28f &&
            minY > -0.15f;

        if (!ok)
        {
            std::cerr << "SPLISHSPLASH_DAMBREAK_WASM_FAIL"
                      << " particles=" << count
                      << " boundary=" << boundaryCount
                      << " steps=" << finalSteps
                      << " initialLinks=" << initialBoundaryLinks
                      << " linksAfter30=" << linksAfter30
                      << " initialMinY=" << initialMinY
                      << " minY=" << minY
                      << " initialMaxX=" << initialMaxX
                      << " maxX=" << maxX
                      << " time=" << time << "\n";
            sph_destroy();
            return 31;
        }

        std::cout << "SPLISHSPLASH_DAMBREAK_WASM_OK"
                  << " particles=" << count
                  << " boundary=" << boundaryCount
                  << " steps=" << finalSteps
                  << " initialLinks=" << initialBoundaryLinks
                  << " linksAfter30=" << linksAfter30
                  << " initialMinY=" << initialMinY
                  << " minY=" << minY
                  << " initialMaxX=" << initialMaxX
                  << " maxX=" << maxX
                  << " time=" << time << "\n";

        sph_destroy();
    }

    return 0;
}
