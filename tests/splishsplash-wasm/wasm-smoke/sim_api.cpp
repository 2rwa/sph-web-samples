#include <emscripten/emscripten.h>

#include "SPlisHSPlasH/Simulation.h"
#include "SPlisHSPlasH/TimeManager.h"
#include "SPlisHSPlasH/FluidModel.h"

#include <algorithm>
#include <cmath>
#include <vector>

using namespace SPH;

namespace {
Simulation* g_sim = nullptr;
FluidModel* g_model = nullptr;
std::vector<float> g_positions;
int g_side = 0;
unsigned int g_step_count = 0;

void refresh_positions()
{
    if (!g_model)
    {
        g_positions.clear();
        return;
    }

    const unsigned int count = g_model->numActiveParticles();
    g_positions.resize(static_cast<size_t>(count) * 3u);
    for (unsigned int i = 0; i < count; ++i)
    {
        const Vector3r& p = g_model->getPosition(i);
        g_positions[3u * i + 0u] = static_cast<float>(p[0]);
        g_positions[3u * i + 1u] = static_cast<float>(p[1]);
        g_positions[3u * i + 2u] = static_cast<float>(p[2]);
    }
}

void destroy_simulation()
{
    g_model = nullptr;
    g_sim = nullptr;
    g_positions.clear();
    g_step_count = 0;
    g_side = 0;

    if (Simulation::hasCurrent())
        delete Simulation::getCurrent();
}

int create_simulation(const int requestedSide)
{
    destroy_simulation();

    const int side = std::max(4, std::min(12, requestedSide));
    const Real particleRadius = static_cast<Real>(0.025);
    const Real spacing = static_cast<Real>(2.0) * particleRadius;
    const unsigned int count = static_cast<unsigned int>(side * side * side);

    std::vector<Vector3r> positions(count);
    std::vector<Vector3r> velocities(count, Vector3r::Zero());
    std::vector<unsigned int> objectIds(count, 0u);

    const Real half = static_cast<Real>(side - 1) * spacing * static_cast<Real>(0.5);
    unsigned int index = 0;
    for (int y = 0; y < side; ++y)
    {
        for (int z = 0; z < side; ++z)
        {
            for (int x = 0; x < side; ++x)
            {
                positions[index++] = Vector3r(
                    static_cast<Real>(x) * spacing - half,
                    static_cast<Real>(0.62) + static_cast<Real>(y) * spacing,
                    static_cast<Real>(z) * spacing - half);
            }
        }
    }

    g_sim = Simulation::getCurrent();
    g_sim->init(particleRadius, false);

    TimeManager::getCurrent()->setTime(static_cast<Real>(0.0));
    TimeManager::getCurrent()->setTimeStepSize(static_cast<Real>(0.001));

    g_sim->addFluidModel(
        "BrowserFluid",
        count,
        positions.data(),
        velocities.data(),
        objectIds.data(),
        0u);

    g_model = g_sim->getFluidModel(0);
    g_model->setViscosityMethod(1u);

    g_sim->setSimulationMethod(static_cast<int>(SimulationMethods::WCSPH));
    g_sim->setSimulationInitialized(1);

    g_side = side;
    g_step_count = 0;
    refresh_positions();
    return static_cast<int>(count);
}
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int sph_init(const int side)
{
    return create_simulation(side);
}

EMSCRIPTEN_KEEPALIVE int sph_reset()
{
    if (!g_sim)
        return create_simulation(g_side > 0 ? g_side : 8);

    g_sim->reset();
    g_step_count = 0;
    refresh_positions();
    return static_cast<int>(g_model ? g_model->numActiveParticles() : 0u);
}

EMSCRIPTEN_KEEPALIVE int sph_step(const int steps)
{
    if (!g_sim || !g_model || !g_sim->getTimeStep())
        return -1;

    const int count = std::max(0, std::min(1000, steps));
    for (int i = 0; i < count; ++i)
    {
        g_sim->getTimeStep()->step();
        ++g_step_count;
    }
    refresh_positions();
    return static_cast<int>(g_step_count);
}

EMSCRIPTEN_KEEPALIVE int sph_particle_count()
{
    return g_model ? static_cast<int>(g_model->numActiveParticles()) : 0;
}

EMSCRIPTEN_KEEPALIVE const float* sph_positions_ptr()
{
    return g_positions.empty() ? nullptr : g_positions.data();
}

EMSCRIPTEN_KEEPALIVE float sph_time()
{
    return TimeManager::hasCurrent()
        ? static_cast<float>(TimeManager::getCurrent()->getTime())
        : 0.0f;
}

EMSCRIPTEN_KEEPALIVE float sph_center_y()
{
    if (!g_model || g_model->numActiveParticles() == 0u)
        return 0.0f;

    double sum = 0.0;
    const unsigned int count = g_model->numActiveParticles();
    for (unsigned int i = 0; i < count; ++i)
        sum += static_cast<double>(g_model->getPosition(i)[1]);

    return static_cast<float>(sum / static_cast<double>(count));
}

EMSCRIPTEN_KEEPALIVE int sph_all_finite()
{
    for (const float value : g_positions)
    {
        if (!std::isfinite(value))
            return 0;
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE int sph_step_count()
{
    return static_cast<int>(g_step_count);
}

EMSCRIPTEN_KEEPALIVE void sph_destroy()
{
    destroy_simulation();
}

}
