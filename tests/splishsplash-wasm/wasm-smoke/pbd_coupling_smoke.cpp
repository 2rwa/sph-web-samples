#include <cmath>
#include <iostream>

extern "C" {
int sph_scene_begin(float particleRadius, int simulationMethod, int boundaryMethod);
int sph_scene_set_gravity(float x, float y, float z);
int sph_scene_set_timing(int cflMethod, float cflFactor, float cflMax, float initialDt);
int sph_scene_set_dfsph(
    unsigned int minIterations,
    unsigned int maxIterations,
    float maxError,
    unsigned int maxIterationsV,
    float maxErrorV,
    int enableDivergenceSolver);
int sph_scene_set_material(float density0, unsigned int viscosityMethod);
int sph_scene_set_standard_viscosity(float viscosity);
int sph_scene_add_fluid_block(
    float sx, float sy, float sz,
    float ex, float ey, float ez,
    float tx, float ty, float tz,
    float scx, float scy, float scz,
    float vx, float vy, float vz,
    int denseMode);
int sph_scene_add_unit_box_bender_file_rotated(
    float tx, float ty, float tz,
    float sx, float sy, float sz,
    float ax, float ay, float az,
    float angle,
    const char* mapFile);
int sph_scene_commit();
int sph_bender_promote_dynamic_pbd(float mass);
int sph_step_dynamic_pbd(int steps);
float sph_pbd_body_position_y();
float sph_pbd_body_velocity_y();
float sph_pbd_max_boundary_force();
float sph_pbd_last_boundary_force();
int sph_all_finite();
float sph_time();
void sph_destroy();
}

int main()
{
    if (!sph_scene_begin(0.025f, 4, 2))
        return 41;

    sph_scene_set_gravity(0.0f, 0.0f, 0.0f);
    sph_scene_set_timing(1, 1.0f, 0.005f, 0.001f);
    sph_scene_set_dfsph(2u, 100u, 0.01f, 100u, 0.1f, 1);
    sph_scene_set_material(1000.0f, 1u);
    sph_scene_set_standard_viscosity(0.01f);

    const int blocks = sph_scene_add_fluid_block(
        -0.25f, 0.05f, -0.25f,
         0.25f, 0.55f,  0.25f,
         0.0f, 0.0f, 0.0f,
         1.0f, 1.0f, 1.0f,
         0.0f, -2.0f, 0.0f,
         0);

    const int boxes = sph_scene_add_unit_box_bender_file_rotated(
        0.0f, -0.25f, 0.0f,
        3.0f, 0.5f, 3.0f,
        0.0f, 0.0f, 1.0f,
        0.0f,
        "unitbox-3x0p5x3-r20-i0-t0.cdm");

    const int particles = sph_scene_commit();
    const int promoted = sph_bender_promote_dynamic_pbd(0.5f);
    const float y0 = sph_pbd_body_position_y();
    const int steps = sph_step_dynamic_pbd(40);
    const float y1 = sph_pbd_body_position_y();
    const float vy = sph_pbd_body_velocity_y();
    const float maxForce = sph_pbd_max_boundary_force();
    const float lastForce = sph_pbd_last_boundary_force();
    const float time = sph_time();

    const bool moved = std::abs(y1 - y0) > 1.0e-8f || std::abs(vy) > 1.0e-8f;
    const bool ok =
        blocks == 1 &&
        boxes == 1 &&
        particles == 1331 &&
        promoted == 1 &&
        steps == 40 &&
        sph_all_finite() &&
        std::isfinite(maxForce) &&
        maxForce > 1.0e-6f &&
        moved &&
        time > 0.0f;

    if (!ok)
    {
        std::cerr << "SPLISHSPLASH_PBD_COUPLING_WASM_FAIL"
                  << " particles=" << particles
                  << " promoted=" << promoted
                  << " steps=" << steps
                  << " y0=" << y0
                  << " y1=" << y1
                  << " vy=" << vy
                  << " maxForce=" << maxForce
                  << " lastForce=" << lastForce
                  << " time=" << time
                  << "\n";
        sph_destroy();
        return 42;
    }

    std::cout << "SPLISHSPLASH_PBD_COUPLING_WASM_OK"
              << " particles=" << particles
              << " promoted=" << promoted
              << " steps=" << steps
              << " y0=" << y0
              << " y1=" << y1
              << " vy=" << vy
              << " maxForce=" << maxForce
              << " lastForce=" << lastForce
              << " time=" << time
              << "\n";
    sph_destroy();
    return 0;
}
