#include <cmath>
#include <iostream>
#include <fstream>

extern "C" {
int sph_init(int side);
int sph_init_dambreak(int resolution);
int sph_scene_begin(float particleRadius, int simulationMethod, int boundaryMethod);
int sph_scene_set_gravity(float x, float y, float z);
int sph_scene_set_timing(int cflMethod, float cflFactor, float cflMax, float initialDt);
int sph_scene_set_wcsph(float stiffness, float exponent);
int sph_scene_set_dfsph(
    unsigned int minIterations,
    unsigned int maxIterations,
    float maxError,
    unsigned int maxIterationsV,
    float maxErrorV,
    int enableDivergenceSolver);
int sph_scene_set_icsph(
    unsigned int minIterations,
    unsigned int maxIterations,
    float maxError,
    float lambda,
    int pressureClamping);
int sph_scene_set_pf(
    unsigned int minIterations,
    unsigned int maxIterations,
    float maxError,
    float stiffness);
int sph_scene_set_iisph(
    unsigned int minIterations,
    unsigned int maxIterations,
    float maxError);
int sph_scene_set_material(float density0, unsigned int viscosityMethod);
int sph_scene_set_standard_viscosity(float viscosity);
int sph_scene_set_peer2015_viscosity(
    float viscosity,
    unsigned int maxIterations,
    float maxError);
int sph_scene_set_peer2016_viscosity(
    float viscosity,
    unsigned int maxIterationsV,
    float maxErrorV,
    unsigned int maxIterationsOmega,
    float maxErrorOmega);
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
int sph_scene_add_unit_box_bender(
    float tx, float ty, float tz,
    float sx, float sy, float sz,
    unsigned int resolutionX,
    unsigned int resolutionY,
    unsigned int resolutionZ,
    int mapInvert,
    float mapThickness);
int sph_scene_add_unit_box_bender_file(
    float tx, float ty, float tz,
    float sx, float sy, float sz,
    const char* mapFile);
int sph_save_last_bender_map(const char* mapFile);
int sph_scene_commit();
int sph_step(int steps);
int sph_particle_count();
int sph_boundary_count();
int sph_boundary_model_count();
int sph_boundary_handling_method();
float sph_last_bender_map_build_ms();
float sph_bender_boundary_volume_sum();
int sph_point_set_count();
int sph_boundary_point_set_index();
int sph_boundary_neighbor_links();
float sph_center_y();
float sph_min_y();
float sph_max_x();
float sph_time();
int sph_all_finite();
int sph_simulation_method();
float sph_standard_viscosity();
int sph_solver_iterations();
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
        sph_scene_set_standard_viscosity(0.01f);

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
            std::abs(sph_standard_viscosity() - 0.01f) > 1.0e-6f ||
            !sph_all_finite())
        {
            std::cerr << "SPLISHSPLASH_GENERIC_SCENE_WASM_FAIL init"
                      << " blocks=" << block1 << "," << block2
                      << " boxes=" << boxes
                      << " particles=" << count
                      << " boundary=" << boundaryCount
                      << " viscosity=" << sph_standard_viscosity()
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



    {
        if (!sph_scene_begin(0.025f, 4, 2))
            return 50;

        sph_scene_set_gravity(0.0f, -9.81f, 0.0f);
        // Upstream DamBreakModel.json requests Bender2019 with CFL max 0.005.
        // The first browser bridge uses sampled Akinci2012 walls and a 0.001 cap.
        sph_scene_set_timing(1, 1.0f, 0.001f, 0.001f);
        sph_scene_set_dfsph(2u, 100u, 0.05f, 100u, 0.1f, 1);
        sph_scene_set_material(1000.0f, 1u);

        const int blocks = sph_scene_add_fluid_block(
            -0.5f, 0.0f, -0.5f,
             0.5f, 1.0f,  0.5f,
            -1.45f, 0.05f, 0.0f,
             1.0f, 1.0f, 1.0f,
             0.0f, 0.0f, 0.0f,
             0);
        const int boxes = sph_scene_add_unit_box(
            0.0f, 1.5f, 0.0f,
            4.0f, 3.0f, 1.5f);

        const int count = sph_scene_commit();
        const int boundaryCount = sph_boundary_count();
        const float centerY0 = sph_center_y();
        const float minY0 = sph_min_y();

        if (
            blocks != 1 ||
            boxes != 1 ||
            count != 9261 ||
            boundaryCount != 18002 ||
            !sph_all_finite() ||
            minY0 < 0.049f)
        {
            std::cerr << "SPLISHSPLASH_GENERIC_DFSPH_WASM_FAIL init"
                      << " blocks=" << blocks
                      << " boxes=" << boxes
                      << " particles=" << count
                      << " boundary=" << boundaryCount
                      << " centerY=" << centerY0
                      << " minY=" << minY0 << "\n";
            sph_destroy();
            return 51;
        }

        const int steps = sph_step(2);
        const int method = sph_simulation_method();
        const int iterations = sph_solver_iterations();
        const float centerY1 = sph_center_y();
        const float minY1 = sph_min_y();
        const float time = sph_time();

        const bool ok =
            steps == 2 &&
            method == 4 &&
            iterations >= 2 &&
            sph_all_finite() &&
            std::isfinite(centerY1) &&
            std::isfinite(minY1) &&
            centerY1 < centerY0 &&
            minY1 > 0.0f &&
            time > 0.0f;

        if (!ok)
        {
            std::cerr << "SPLISHSPLASH_GENERIC_DFSPH_WASM_FAIL runtime"
                      << " particles=" << count
                      << " boundary=" << boundaryCount
                      << " steps=" << steps
                      << " method=" << method
                      << " iterations=" << iterations
                      << " centerY0=" << centerY0
                      << " centerY1=" << centerY1
                      << " minY0=" << minY0
                      << " minY1=" << minY1
                      << " time=" << time << "\n";
            sph_destroy();
            return 52;
        }

        std::cout << "SPLISHSPLASH_GENERIC_DFSPH_WASM_OK"
                  << " particles=" << count
                  << " boundary=" << boundaryCount
                  << " steps=" << steps
                  << " method=" << method
                  << " iterations=" << iterations
                  << " centerY0=" << centerY0
                  << " centerY1=" << centerY1
                  << " minY=" << minY1
                  << " time=" << time << "\n";

        sph_destroy();
    }



    {
        if (!sph_scene_begin(0.025f, 4, 2))
            return 60;

        sph_scene_set_gravity(0.0f, -9.81f, 0.0f);
        sph_scene_set_timing(1, 1.0f, 0.001f, 0.001f);
        sph_scene_set_dfsph(2u, 100u, 0.05f, 100u, 0.1f, 1);
        sph_scene_set_material(1000.0f, 1u);

        const int block1 = sph_scene_add_fluid_block(
            -1.5f, 0.0f, -1.5f,
            -0.8f, 0.75f, -0.8f,
             0.0f, 0.0f, 0.0f,
             1.0f, 1.0f, 1.0f,
             0.0f, 0.0f, 0.0f,
             0);
        const int block2 = sph_scene_add_fluid_block(
             0.8f, 0.0f, 0.8f,
             1.5f, 0.75f, 1.5f,
             0.0f, 0.0f, 0.0f,
             1.0f, 1.0f, 1.0f,
             0.0f, 0.0f, 0.0f,
             0);
        const int boxes = sph_scene_add_unit_box(
            0.0f, 1.5f, 0.0f,
            3.1f, 3.1f, 3.1f);

        const int count = sph_scene_commit();
        const int boundaryCount = sph_boundary_count();
        const float centerY0 = sph_center_y();
        const float minY0 = sph_min_y();

        if (
            block1 != 1 ||
            block2 != 2 ||
            boxes != 1 ||
            count != 7200 ||
            boundaryCount != 23066 ||
            sph_simulation_method() != 4 ||
            !sph_all_finite())
        {
            std::cerr << "SPLISHSPLASH_GENERIC_DOUBLE_DFSPH_WASM_FAIL init"
                      << " blocks=" << block1 << "," << block2
                      << " boxes=" << boxes
                      << " particles=" << count
                      << " boundary=" << boundaryCount
                      << " method=" << sph_simulation_method()
                      << " centerY=" << centerY0
                      << " minY=" << minY0 << "\n";
            sph_destroy();
            return 61;
        }

        const int steps = sph_step(2);
        const int iterations = sph_solver_iterations();
        const float centerY1 = sph_center_y();
        const float minY1 = sph_min_y();
        const float time = sph_time();

        const bool ok =
            steps == 2 &&
            iterations >= 2 &&
            sph_all_finite() &&
            std::isfinite(centerY1) &&
            std::isfinite(minY1) &&
            centerY1 < centerY0 &&
            minY1 > -0.05f &&
            time > 0.0f;

        if (!ok)
        {
            std::cerr << "SPLISHSPLASH_GENERIC_DOUBLE_DFSPH_WASM_FAIL runtime"
                      << " particles=" << count
                      << " boundary=" << boundaryCount
                      << " steps=" << steps
                      << " iterations=" << iterations
                      << " centerY0=" << centerY0
                      << " centerY1=" << centerY1
                      << " minY0=" << minY0
                      << " minY1=" << minY1
                      << " time=" << time << "\n";
            sph_destroy();
            return 62;
        }

        std::cout << "SPLISHSPLASH_GENERIC_DOUBLE_DFSPH_WASM_OK"
                  << " particles=" << count
                  << " boundary=" << boundaryCount
                  << " steps=" << steps
                  << " iterations=" << iterations
                  << " centerY0=" << centerY0
                  << " centerY1=" << centerY1
                  << " minY=" << minY1
                  << " time=" << time << "\n";

        sph_destroy();
    }



    {
        if (!sph_scene_begin(0.025f, 6, 2))
            return 70;
        sph_scene_set_gravity(0.0f, -9.81f, 0.0f);
        sph_scene_set_timing(1, 1.0f, 0.001f, 0.001f);
        sph_scene_set_icsph(2u, 100u, 0.05f, 100000.0f, 0);
        sph_scene_set_material(1000.0f, 1u);
        sph_scene_add_fluid_block(-0.4f,-0.4f,-0.4f, 0.4f,0.4f,0.4f, -0.6f,0.6f,0.0f, 1,1,1, 5,0,0, 0);
        sph_scene_add_fluid_block(-0.4f,-0.4f,-0.4f, 0.4f,0.4f,0.4f,  0.6f,0.6f,0.0f, 1,1,1,-5,0,0, 0);
        sph_scene_add_unit_box(0,1.5f,0, 3.1f,3.1f,3.1f);
        const int count = sph_scene_commit();
        const float x0 = sph_max_x();
        const int steps = sph_step(1);
        const int method = sph_simulation_method();
        const int iterations = sph_solver_iterations();
        const float x1 = sph_max_x();
        const float time = sph_time();
        const bool ok = count==9826 && sph_boundary_count()==23066 && steps==1 &&
            method==6 && iterations>=2 && sph_all_finite() && std::isfinite(x1) &&
            x1 < x0 && time>0.0f;
        if (!ok) {
            std::cerr << "SPLISHSPLASH_GENERIC_ICSPH_WASM_FAIL particles=" << count
                      << " boundary=" << sph_boundary_count() << " steps=" << steps
                      << " method=" << method << " iterations=" << iterations
                      << " x0=" << x0 << " x1=" << x1 << " time=" << time << "\n";
            sph_destroy(); return 71;
        }
        std::cout << "SPLISHSPLASH_GENERIC_ICSPH_WASM_OK particles=" << count
                  << " boundary=" << sph_boundary_count() << " steps=" << steps
                  << " method=" << method << " iterations=" << iterations
                  << " x0=" << x0 << " x1=" << x1 << " time=" << time << "\n";
        sph_destroy();
    }

    {
        if (!sph_scene_begin(0.025f, 5, 2))
            return 80;
        sph_scene_set_gravity(0.0f, -9.81f, 0.0f);
        sph_scene_set_timing(1, 1.0f, 0.001f, 0.001f);
        sph_scene_set_pf(2u, 100u, 0.05f, 25000.0f);
        sph_scene_set_material(1000.0f, 1u);
        sph_scene_add_fluid_block(-0.4f,-0.4f,-0.4f, 0.4f,0.4f,0.4f, -0.6f,0.6f,0.0f, 1,1,1, 5,0,0, 0);
        sph_scene_add_fluid_block(-0.4f,-0.4f,-0.4f, 0.4f,0.4f,0.4f,  0.6f,0.6f,0.0f, 1,1,1,-5,0,0, 0);
        sph_scene_add_unit_box(0,1.5f,0, 3.1f,3.1f,3.1f);
        const int count = sph_scene_commit();
        const int steps = sph_step(1);
        const int method = sph_simulation_method();
        const int iterations = sph_solver_iterations();
        const float time = sph_time();
        const bool ok = count==9826 && sph_boundary_count()==23066 && steps==1 &&
            method==5 && iterations>=2 && sph_all_finite() && time>0.0f;
        if (!ok) {
            std::cerr << "SPLISHSPLASH_GENERIC_PF_WASM_FAIL particles=" << count
                      << " boundary=" << sph_boundary_count() << " steps=" << steps
                      << " method=" << method << " iterations=" << iterations
                      << " time=" << time << "\n";
            sph_destroy(); return 81;
        }
        std::cout << "SPLISHSPLASH_GENERIC_PF_WASM_OK particles=" << count
                  << " boundary=" << sph_boundary_count() << " steps=" << steps
                  << " method=" << method << " iterations=" << iterations
                  << " time=" << time << "\n";
        sph_destroy();
    }



    {
        if (!sph_scene_begin(0.025f, 0, 2))
            return 90;
        sph_scene_set_gravity(0.0f, -9.81f, 0.0f);
        sph_scene_set_timing(1, 1.0f, 0.001f, 0.001f);
        sph_scene_set_wcsph(25000.0f, 1.0f);
        sph_scene_set_material(1000.0f, 1u);
        sph_scene_add_fluid_block(
            -0.2f, 0.0f, -0.2f,
             0.2f, 0.4f,  0.2f,
             0.0f, 0.02f, 0.0f,
             1.0f, 1.0f, 1.0f,
             0.0f, 0.0f, 0.0f,
             0);
        const char* mapFile = "unitbox-3p1-r25-i1-t0.cdm";
        const bool cachedMap = std::ifstream(mapFile, std::ios::binary).good();
        const int boxes = cachedMap
            ? sph_scene_add_unit_box_bender_file(
                0.0f, 1.5f, 0.0f,
                3.1f, 3.1f, 3.1f,
                mapFile)
            : sph_scene_add_unit_box_bender(
                0.0f, 1.5f, 0.0f,
                3.1f, 3.1f, 3.1f,
                25u, 25u, 25u,
                1, 0.0f);

        const int count = sph_scene_commit();
        if (!cachedMap && !sph_save_last_bender_map(mapFile))
        {
            std::cerr << "SPLISHSPLASH_BENDER2019_MAP_WASM_FAIL save\n";
            sph_destroy();
            return 93;
        }
        const float mapMs = sph_last_bender_map_build_ms();
        const int boundaryModels = sph_boundary_model_count();
        const int boundaryMethod = sph_boundary_handling_method();
        const float minY0 = sph_min_y();

        if (
            boxes != 1 ||
            count != 729 ||
            boundaryModels != 1 ||
            boundaryMethod != 2 ||
            !(mapMs > 0.0f) ||
            !sph_all_finite())
        {
            std::cerr << "SPLISHSPLASH_BENDER2019_MAP_WASM_FAIL init"
                      << " boxes=" << boxes
                      << " particles=" << count
                      << " boundaryModels=" << boundaryModels
                      << " boundaryMethod=" << boundaryMethod
                      << " mapMs=" << mapMs
                      << " minY=" << minY0 << "\n";
            sph_destroy();
            return 91;
        }

        const int steps = sph_step(1);
        const float volumeSum = sph_bender_boundary_volume_sum();
        const float minY1 = sph_min_y();
        const float time = sph_time();

        const bool ok =
            steps == 1 &&
            sph_all_finite() &&
            std::isfinite(volumeSum) &&
            volumeSum > 0.0f &&
            minY1 > -0.05f &&
            time > 0.0f;

        if (!ok)
        {
            std::cerr << "SPLISHSPLASH_BENDER2019_MAP_WASM_FAIL runtime"
                      << " particles=" << count
                      << " steps=" << steps
                      << " mapMs=" << mapMs
                      << " volumeSum=" << volumeSum
                      << " minY0=" << minY0
                      << " minY1=" << minY1
                      << " time=" << time << "\n";
            sph_destroy();
            return 92;
        }

        std::cout << "SPLISHSPLASH_BENDER2019_MAP_WASM_OK"
                  << " particles=" << count
                  << " steps=" << steps
                  << " mapResolution=25x25x25"
                  << " mapSource=" << (cachedMap ? "cache" : "generated")
                  << " mapMs=" << mapMs
                  << " volumeSum=" << volumeSum
                  << " minY=" << minY1
                  << " time=" << time << "\n";
        sph_destroy();
    }



    {
        if (!sph_scene_begin(0.025f, 0, 2))
            return 94;
        sph_scene_set_gravity(0.0f, -9.81f, 0.0f);
        sph_scene_set_timing(1, 1.0f, 0.001f, 0.001f);
        sph_scene_set_wcsph(25000.0f, 1.0f);
        sph_scene_set_material(1000.0f, 1u);
        sph_scene_add_fluid_block(
            -0.2f, 0.0f, -0.2f,
             0.2f, 0.4f,  0.2f,
             0.0f, 0.02f, 0.0f,
             1.0f, 1.0f, 1.0f,
             0.0f, 0.0f, 0.0f,
             0);

        const char* mapFile = "unitbox-4x3x1p5-r40x30x15-i1-t0.cdm";
        const bool cachedMap = std::ifstream(mapFile, std::ios::binary).good();
        const int boxes = cachedMap
            ? sph_scene_add_unit_box_bender_file(
                0.0f, 1.5f, 0.0f,
                4.0f, 3.0f, 1.5f,
                mapFile)
            : sph_scene_add_unit_box_bender(
                0.0f, 1.5f, 0.0f,
                4.0f, 3.0f, 1.5f,
                40u, 30u, 15u,
                1, 0.0f);

        const int count = sph_scene_commit();
        if (!cachedMap && !sph_save_last_bender_map(mapFile))
        {
            std::cerr << "SPLISHSPLASH_BENDER2019_DAMBREAK_MAP_WASM_FAIL save\n";
            sph_destroy();
            return 95;
        }

        const float mapMs = sph_last_bender_map_build_ms();
        const int steps = sph_step(1);
        const float volumeSum = sph_bender_boundary_volume_sum();
        const float minY = sph_min_y();
        const float time = sph_time();

        const bool ok =
            boxes == 1 &&
            count == 729 &&
            sph_boundary_model_count() == 1 &&
            sph_boundary_handling_method() == 2 &&
            steps == 1 &&
            sph_all_finite() &&
            std::isfinite(volumeSum) &&
            volumeSum > 0.0f &&
            minY > -0.05f &&
            time > 0.0f;

        if (!ok)
        {
            std::cerr << "SPLISHSPLASH_BENDER2019_DAMBREAK_MAP_WASM_FAIL"
                      << " particles=" << count
                      << " steps=" << steps
                      << " mapMs=" << mapMs
                      << " volumeSum=" << volumeSum
                      << " minY=" << minY
                      << " time=" << time << "\n";
            sph_destroy();
            return 96;
        }

        std::cout << "SPLISHSPLASH_BENDER2019_DAMBREAK_MAP_WASM_OK"
                  << " particles=" << count
                  << " steps=" << steps
                  << " mapResolution=40x30x15"
                  << " mapSource=" << (cachedMap ? "cache" : "generated")
                  << " mapMs=" << mapMs
                  << " volumeSum=" << volumeSum
                  << " minY=" << minY
                  << " time=" << time << "\n";
        sph_destroy();
    }



    {
        if (!sph_scene_begin(0.025f, 3, 2))
            return 100;

        sph_scene_set_gravity(0.1f, -9.81f, 0.0f);
        sph_scene_set_timing(0, 0.5f, 0.005f, 0.001f);
        sph_scene_set_iisph(2u, 100u, 0.01f);
        sph_scene_set_material(1000.0f, 3u);
        sph_scene_set_peer2015_viscosity(0.05f, 200u, 0.08f);

        const int blocks = sph_scene_add_fluid_block(
            -0.1f, 0.01f, -0.4f,
             0.1f, 6.0f,   0.4f,
             0.0f, 0.1f,   0.0f,
             0.75f, 1.0f, 0.75f,
             0.0f, 0.0f, 0.0f,
             0);

        const char* mapFile = "unitbox-3x0p5x3-r20-i0-t0.cdm";
        const bool cachedMap = std::ifstream(mapFile, std::ios::binary).good();
        const int boxes = cachedMap
            ? sph_scene_add_unit_box_bender_file(
                0.0f, -0.25f, 0.0f,
                3.0f, 0.5f, 3.0f,
                mapFile)
            : sph_scene_add_unit_box_bender(
                0.0f, -0.25f, 0.0f,
                3.0f, 0.5f, 3.0f,
                20u, 20u, 20u,
                0, 0.0f);

        const int count = sph_scene_commit();
        if (!cachedMap && !sph_save_last_bender_map(mapFile))
        {
            std::cerr << "SPLISHSPLASH_GENERIC_IISPH_WASM_FAIL save\n";
            sph_destroy();
            return 101;
        }

        const float mapMs = sph_last_bender_map_build_ms();
        const float centerY0 = sph_center_y();
        const int steps = sph_step(1);
        const int method = sph_simulation_method();
        const int iterations = sph_solver_iterations();
        const float centerY1 = sph_center_y();
        const float minY = sph_min_y();
        const float time = sph_time();

        const bool ok =
            blocks == 1 &&
            boxes == 1 &&
            count == 6240 &&
            sph_boundary_model_count() == 1 &&
            sph_boundary_handling_method() == 2 &&
            steps == 1 &&
            method == 3 &&
            iterations >= 2 &&
            sph_all_finite() &&
            std::isfinite(centerY1) &&
            std::isfinite(minY) &&
            time > 0.0f;

        if (!ok)
        {
            std::cerr << "SPLISHSPLASH_GENERIC_IISPH_WASM_FAIL"
                      << " particles=" << count
                      << " boundaryModels=" << sph_boundary_model_count()
                      << " steps=" << steps
                      << " method=" << method
                      << " iterations=" << iterations
                      << " mapSource=" << (cachedMap ? "cache" : "generated")
                      << " mapMs=" << mapMs
                      << " centerY0=" << centerY0
                      << " centerY1=" << centerY1
                      << " minY=" << minY
                      << " time=" << time << "\n";
            sph_destroy();
            return 102;
        }

        std::cout << "SPLISHSPLASH_GENERIC_IISPH_WASM_OK"
                  << " particles=" << count
                  << " boundaryModels=" << sph_boundary_model_count()
                  << " steps=" << steps
                  << " method=" << method
                  << " iterations=" << iterations
                  << " mapResolution=20x20x20"
                  << " mapSource=" << (cachedMap ? "cache" : "generated")
                  << " mapMs=" << mapMs
                  << " centerY0=" << centerY0
                  << " centerY1=" << centerY1
                  << " minY=" << minY
                  << " time=" << time << "\n";

        sph_destroy();
    }



    {
        if (!sph_scene_begin(0.025f, 3, 2))
            return 110;

        sph_scene_set_gravity(0.1f, -9.81f, 0.0f);
        sph_scene_set_timing(0, 0.5f, 0.005f, 0.001f);
        sph_scene_set_iisph(2u, 100u, 0.01f);
        sph_scene_set_material(1000.0f, 4u);
        sph_scene_set_peer2016_viscosity(0.05f, 200u, 0.08f, 200u, 0.01f);

        const int blocks = sph_scene_add_fluid_block(
            -0.1f, 0.01f, -0.4f,
             0.1f, 6.0f,   0.4f,
             0.0f, 0.1f,   0.0f,
             0.75f, 1.0f, 0.75f,
             0.0f, 0.0f, 0.0f,
             0);

        const char* mapFile = "unitbox-3x0p5x3-r20-i0-t0.cdm";
        const int boxes = sph_scene_add_unit_box_bender_file(
            0.0f, -0.25f, 0.0f,
            3.0f, 0.5f, 3.0f,
            mapFile);

        const int count = sph_scene_commit();
        const float centerY0 = sph_center_y();
        const int steps = sph_step(1);
        const int method = sph_simulation_method();
        const int iterations = sph_solver_iterations();
        const float centerY1 = sph_center_y();
        const float minY = sph_min_y();
        const float time = sph_time();

        const bool ok =
            blocks == 1 &&
            boxes == 1 &&
            count == 6240 &&
            sph_boundary_model_count() == 1 &&
            sph_boundary_handling_method() == 2 &&
            steps == 1 &&
            method == 3 &&
            iterations >= 2 &&
            sph_all_finite() &&
            std::isfinite(centerY1) &&
            std::isfinite(minY) &&
            time > 0.0f;

        if (!ok)
        {
            std::cerr << "SPLISHSPLASH_GENERIC_IISPH_PEER2016_WASM_FAIL"
                      << " particles=" << count
                      << " boundaryModels=" << sph_boundary_model_count()
                      << " steps=" << steps
                      << " method=" << method
                      << " iterations=" << iterations
                      << " centerY0=" << centerY0
                      << " centerY1=" << centerY1
                      << " minY=" << minY
                      << " time=" << time << "\n";
            sph_destroy();
            return 111;
        }

        std::cout << "SPLISHSPLASH_GENERIC_IISPH_PEER2016_WASM_OK"
                  << " particles=" << count
                  << " boundaryModels=" << sph_boundary_model_count()
                  << " steps=" << steps
                  << " method=" << method
                  << " iterations=" << iterations
                  << " centerY0=" << centerY0
                  << " centerY1=" << centerY1
                  << " minY=" << minY
                  << " time=" << time << "\n";

        sph_destroy();
    }

    return 0;
}
