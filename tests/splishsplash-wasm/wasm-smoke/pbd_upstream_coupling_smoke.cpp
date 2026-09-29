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
int sph_bender_promote_dynamic_pbd_box(float mass, float sx, float sy, float sz);
int sph_pbd_enable_upstream_timestep(float gravityScale);
int sph_step_dynamic_pbd_upstream(int steps);
float sph_pbd_body_position_y();
float sph_pbd_body_speed();
float sph_pbd_max_boundary_force();
float sph_pbd_upstream_time();
int sph_all_finite();
float sph_time();
void sph_destroy();
}

int main()
{
    if (!sph_scene_begin(0.025f, 4, 2))
        return 81;

    sph_scene_set_gravity(0.0f, 0.0f, 0.0f);
    sph_scene_set_timing(1, 1.0f, 0.0025f, 0.0005f);
    sph_scene_set_dfsph(2u, 100u, 0.01f, 100u, 0.1f, 1);
    sph_scene_set_material(1000.0f, 1u);
    sph_scene_set_standard_viscosity(0.01f);

    const int blocks = sph_scene_add_fluid_block(
        -0.25f, 0.05f, -0.25f,
         0.25f, 0.55f,  0.25f,
         0.0f, 0.0f, 0.0f,
         1.0f, 1.0f, 1.0f,
         0.0f, -0.5f, 0.0f,
         0);

    const int boxes = sph_scene_add_unit_box_bender_file_rotated(
        0.0f, -0.25f, 0.0f,
        3.0f, 0.5f, 3.0f,
        0.0f, 0.0f, 1.0f,
        0.0f,
        "unitbox-3x0p5x3-r20-i0-t0.cdm");

    const int particles = sph_scene_commit();
    const int promoted = sph_bender_promote_dynamic_pbd_box(250.0f, 3.0f, 0.5f, 3.0f);
    const int enabled = sph_pbd_enable_upstream_timestep(0.0f);
    const float y0 = sph_pbd_body_position_y();
    const int steps = sph_step_dynamic_pbd_upstream(120);
    const float y1 = sph_pbd_body_position_y();
    const float displacement = y1 - y0;
    const float speed = sph_pbd_body_speed();
    const float maxForce = sph_pbd_max_boundary_force();
    const float pbdTime = sph_pbd_upstream_time();
    const float sphTime = sph_time();

    const bool ok =
        blocks == 1 &&
        boxes == 1 &&
        particles == 1331 &&
        promoted == 1 &&
        enabled == 1 &&
        steps == 120 &&
        sph_all_finite() &&
        std::isfinite(displacement) &&
        std::isfinite(speed) &&
        std::isfinite(maxForce) &&
        std::isfinite(pbdTime) &&
        displacement < -0.002f &&
        displacement > -0.25f &&
        speed > 0.0f &&
        speed < 2.0f &&
        maxForce > 1000.0f &&
        pbdTime > 0.0f &&
        sphTime > 0.0f;

    if (!ok)
    {
        std::cerr << "SPLISHSPLASH_PBD_UPSTREAM_COUPLING_WASM_FAIL"
                  << " particles=" << particles
                  << " promoted=" << promoted
                  << " enabled=" << enabled
                  << " steps=" << steps
                  << " displacementY=" << displacement
                  << " speed=" << speed
                  << " maxForce=" << maxForce
                  << " sphTime=" << sphTime
                  << " pbdTime=" << pbdTime
                  << "\n";
        sph_destroy();
        return 82;
    }

    std::cout << "SPLISHSPLASH_PBD_UPSTREAM_COUPLING_WASM_OK"
              << " particles=" << particles
              << " mass=250"
              << " fluidVy=-0.5"
              << " steps=" << steps
              << " displacementY=" << displacement
              << " speed=" << speed
              << " maxForce=" << maxForce
              << " sphTime=" << sphTime
              << " pbdTime=" << pbdTime
              << "\n";
    sph_destroy();
    return 0;
}
