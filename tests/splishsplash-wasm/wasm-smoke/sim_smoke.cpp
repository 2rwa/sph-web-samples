#include <cmath>
#include <iostream>

extern "C" {
int sph_init(int side);
int sph_init_dambreak(int resolution);
int sph_scene_begin(float particleRadius, int simulationMethod, int boundaryMethod);
int sph_scene_set_gravity(float x, float y, float z);
int sph_scene_set_timing(int cflMethod, float cflFactor, float cflMax, float initialDt);
int sph_scene_set_wcsph(float stiffness, float exponent);
int sph_scene_set_material(float density0, unsigned int viscosityMethod);
int sph_scene_add_fluid_block(
    float sx, float sy, float sz,
    float ex, float ey, float ez,
    float tx, float ty, float tz,
    float scx, float scy, float scz,
    float vx, float vy, float vz,
    int denseMode);
int sph_scene_add_unit_box(
    float tx, float ty, float tz,
    float sx, float sy, float sz);
int sph_scene_commit();
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


    {
        if (!sph_scene_begin(0.025f, 0, 2))
            return 40;

        sph_scene_set_gravity(0.0f, -9.81f, 0.0f);
        // The upstream JSON requests 0.005, but the first browser bridge replaces
        // Bender2019 with sampled Akinci2012 walls and explicitly uses a 0.001 cap.
        sph_scene_set_timing(1, 1.0f, 0.001f, 0.001f);
        sph_scene_set_wcsph(25000.0f, 1.0f);
        sph_scene_set_material(1000.0f, 1u);

        const int block1 = sph_scene_add_fluid_block(
            -0.4f, -0.4f, -0.4f,
             0.4f,  0.4f,  0.4f,
            -0.6f,  0.6f,  0.0f,
             1.0f,  1.0f,  1.0f,
             5.0f,  0.0f,  0.0f,
             0);
        const int block2 = sph_scene_add_fluid_block(
            -0.4f, -0.4f, -0.4f,
             0.4f,  0.4f,  0.4f,
             0.6f,  0.6f,  0.0f,
             1.0f,  1.0f,  1.0f,
            -5.0f,  0.0f,  0.0f,
             0);
        const int boxes = sph_scene_add_unit_box(
            0.0f, 1.5f, 0.0f,
            3.1f, 3.1f, 3.1f);

        const int count = sph_scene_commit();
        const int boundaryCount = sph_boundary_count();
        const float x0 = sph_max_x();
        const float y0 = sph_min_y();

        if (
            block1 != 1 ||
            block2 != 2 ||
            boxes != 1 ||
            count != 9826 ||
            boundaryCount < 20000 ||
            !sph_all_finite())
        {
            std::cerr << "SPLISHSPLASH_GENERIC_SCENE_WASM_FAIL init"
                      << " blocks=" << block1 << "," << block2
                      << " boxes=" << boxes
                      << " particles=" << count
                      << " boundary=" << boundaryCount
                      << " minY=" << y0
                      << " maxX=" << x0 << "\n";
            sph_destroy();
            return 41;
        }

        const int steps = sph_step(5);
        const float x1 = sph_max_x();
        const float y1 = sph_min_y();
        const float time = sph_time();

        const bool ok =
            steps == 5 &&
            sph_all_finite() &&
            std::isfinite(x1) &&
            std::isfinite(y1) &&
            x1 < x0 &&
            x1 > 0.90f &&
            x1 < 1.55f &&
            y1 > -0.05f &&
            time > 0.0f;

        if (!ok)
        {
            std::cerr << "SPLISHSPLASH_GENERIC_SCENE_WASM_FAIL runtime"
                      << " particles=" << count
                      << " boundary=" << boundaryCount
                      << " steps=" << steps
                      << " x0=" << x0
                      << " x1=" << x1
                      << " y0=" << y0
                      << " y1=" << y1
                      << " time=" << time << "\n";
            sph_destroy();
            return 42;
        }

        std::cout << "SPLISHSPLASH_GENERIC_SCENE_WASM_OK"
                  << " particles=" << count
                  << " boundary=" << boundaryCount
                  << " steps=" << steps
                  << " x0=" << x0
                  << " x1=" << x1
                  << " minY=" << y1
                  << " time=" << time << "\n";

        sph_destroy();
    }

    return 0;
}
