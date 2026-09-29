#include <cmath>
#include <iostream>
#include <vector>

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
int sph_step_dynamic_pbd(int steps);
float sph_pbd_body_position_y();
float sph_pbd_body_velocity_y();
float sph_pbd_body_speed();
float sph_pbd_body_angular_speed();
float sph_pbd_max_boundary_force();
int sph_all_finite();
float sph_time();
void sph_destroy();
}

struct Case
{
    float mass;
    float fluidVy;
    int steps;
};

struct Result
{
    bool ok;
    float displacement;
    float vy;
    float speed;
    float angularSpeed;
    float maxForce;
    float time;
};

Result runCase(const Case& c)
{
    Result r{false, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};

    if (!sph_scene_begin(0.025f, 4, 2))
        return r;

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
         0.0f, c.fluidVy, 0.0f,
         0);

    const int boxes = sph_scene_add_unit_box_bender_file_rotated(
        0.0f, -0.25f, 0.0f,
        3.0f, 0.5f, 3.0f,
        0.0f, 0.0f, 1.0f,
        0.0f,
        "unitbox-3x0p5x3-r20-i0-t0.cdm");

    const int particles = sph_scene_commit();
    const int promoted = sph_bender_promote_dynamic_pbd_box(c.mass, 3.0f, 0.5f, 3.0f);
    const float y0 = sph_pbd_body_position_y();
    const int steps = sph_step_dynamic_pbd(c.steps);
    const float y1 = sph_pbd_body_position_y();

    r.displacement = y1 - y0;
    r.vy = sph_pbd_body_velocity_y();
    r.speed = sph_pbd_body_speed();
    r.angularSpeed = sph_pbd_body_angular_speed();
    r.maxForce = sph_pbd_max_boundary_force();
    r.time = sph_time();

    r.ok =
        blocks == 1 &&
        boxes == 1 &&
        particles == 1331 &&
        promoted == 1 &&
        steps == c.steps &&
        sph_all_finite() &&
        std::isfinite(r.displacement) &&
        std::isfinite(r.speed) &&
        std::isfinite(r.angularSpeed) &&
        std::isfinite(r.maxForce) &&
        r.maxForce > 1.0e-6f;

    sph_destroy();
    return r;
}

int main()
{
    const std::vector<Case> cases = {
        {50.0f,   -0.25f, 120},
        {100.0f,  -0.25f, 120},
        {250.0f,  -0.25f, 120},
        {500.0f,  -0.25f, 120},
        {1000.0f, -0.25f, 120},
        {250.0f,  -0.50f, 120},
        {500.0f,  -0.50f, 120},
        {1000.0f, -0.50f, 120},
        {2000.0f, -0.50f, 120},
        {500.0f,  -1.00f, 120},
        {1000.0f, -1.00f, 120},
        {2000.0f, -1.00f, 120},
    };

    int stableCount = 0;
    float bestScore = 1.0e30f;
    int bestIndex = -1;

    for (size_t i = 0; i < cases.size(); ++i)
    {
        const Result r = runCase(cases[i]);
        const float absDisp = std::abs(r.displacement);
        const bool stable =
            r.ok &&
            absDisp >= 0.002f &&
            absDisp <= 0.25f &&
            r.speed <= 2.0f &&
            r.angularSpeed <= 2.0f;

        if (stable)
        {
            ++stableCount;
            const float score = std::abs(absDisp - 0.05f) + 0.05f * r.speed;
            if (score < bestScore)
            {
                bestScore = score;
                bestIndex = static_cast<int>(i);
            }
        }

        std::cout << "SPLISHSPLASH_PBD_SWEEP_CASE"
                  << " index=" << i
                  << " mass=" << cases[i].mass
                  << " fluidVy=" << cases[i].fluidVy
                  << " steps=" << cases[i].steps
                  << " ok=" << r.ok
                  << " stable=" << stable
                  << " displacementY=" << r.displacement
                  << " vy=" << r.vy
                  << " speed=" << r.speed
                  << " angularSpeed=" << r.angularSpeed
                  << " maxForce=" << r.maxForce
                  << " time=" << r.time
                  << "\n";
    }

    if (stableCount == 0 || bestIndex < 0)
    {
        std::cerr << "SPLISHSPLASH_PBD_SWEEP_FAIL stableCount=0\n";
        return 51;
    }

    const Case& best = cases[static_cast<size_t>(bestIndex)];
    std::cout << "SPLISHSPLASH_PBD_SWEEP_OK"
              << " stableCount=" << stableCount
              << " selectedIndex=" << bestIndex
              << " selectedMass=" << best.mass
              << " selectedFluidVy=" << best.fluidVy
              << " selectedSteps=" << best.steps
              << "\n";
    return 0;
}
