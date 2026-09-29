#include <emscripten/emscripten.h>

#include "SPlisHSPlasH/Simulation.h"
#include "SPlisHSPlasH/TimeManager.h"
#include "SPlisHSPlasH/TimeStep.h"
#include "SPlisHSPlasH/WCSPH/TimeStepWCSPH.h"
#include "SPlisHSPlasH/FluidModel.h"
#include "SPlisHSPlasH/BoundaryModel_Akinci2012.h"
#include "SPlisHSPlasH/StaticRigidBody.h"
#include "Utilities/Logger.h"
#include "Utilities/Timing.h"
#include "Utilities/Counting.h"

#include <algorithm>
#include <cmath>
#include <set>
#include <tuple>
#include <vector>

using namespace SPH;

INIT_LOGGING
INIT_TIMING
INIT_COUNTING

namespace {
Simulation* g_sim = nullptr;
FluidModel* g_model = nullptr;
BoundaryModel_Akinci2012* g_boundary = nullptr;
std::vector<float> g_positions;
std::vector<float> g_boundary_positions;
int g_side = 0;
int g_scene = 0;
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

void refresh_boundary_positions()
{
    if (!g_boundary)
    {
        g_boundary_positions.clear();
        return;
    }

    const unsigned int count = g_boundary->numberOfParticles();
    g_boundary_positions.resize(static_cast<size_t>(count) * 3u);
    for (unsigned int i = 0; i < count; ++i)
    {
        const Vector3r& p = g_boundary->getPosition(i);
        g_boundary_positions[3u * i + 0u] = static_cast<float>(p[0]);
        g_boundary_positions[3u * i + 1u] = static_cast<float>(p[1]);
        g_boundary_positions[3u * i + 2u] = static_cast<float>(p[2]);
    }
}

void destroy_simulation()
{
    g_model = nullptr;
    g_boundary = nullptr;
    g_sim = nullptr;
    g_positions.clear();
    g_boundary_positions.clear();
    g_step_count = 0;
    g_side = 0;
    g_scene = 0;

    if (Simulation::hasCurrent())
        delete Simulation::getCurrent();
}

std::vector<Vector3r> make_open_box_boundary(const Real spacing)
{
    // Open-top tank. Integer grid coordinates avoid duplicate edge/corner particles.
    // Boundary sampling follows the upstream mesh-sampling scale (about one particle radius),
    // while keeping the physical tank size at x=[-0.6,0.6], z=[-0.4,0.4], y=[0,0.9].
    const int minX = -24;
    const int maxX = 24;
    const int minZ = -16;
    const int maxZ = 16;
    const int minY = 0;
    const int maxY = 36;

    std::set<std::tuple<int, int, int>> cells;

    for (int x = minX; x <= maxX; ++x)
    {
        for (int z = minZ; z <= maxZ; ++z)
            cells.insert(std::make_tuple(x, minY, z));
    }

    for (int y = minY; y <= maxY; ++y)
    {
        for (int z = minZ; z <= maxZ; ++z)
        {
            cells.insert(std::make_tuple(minX, y, z));
            cells.insert(std::make_tuple(maxX, y, z));
        }

        for (int x = minX; x <= maxX; ++x)
        {
            cells.insert(std::make_tuple(x, y, minZ));
            cells.insert(std::make_tuple(x, y, maxZ));
        }
    }

    std::vector<Vector3r> result;
    result.reserve(cells.size());

    for (std::set<std::tuple<int, int, int>>::const_iterator it = cells.begin(); it != cells.end(); ++it)
    {
        result.push_back(Vector3r(
            static_cast<Real>(std::get<0>(*it)) * spacing,
            static_cast<Real>(std::get<1>(*it)) * spacing,
            static_cast<Real>(std::get<2>(*it)) * spacing));
    }

    return result;
}

void add_akinci_boundary(const std::vector<Vector3r>& boundaryParticles)
{
    StaticRigidBody* rb = new StaticRigidBody();
    rb->setPosition0(Vector3r::Zero());
    rb->setPosition(Vector3r::Zero());
    rb->setRotation0(Quaternionr::Identity());
    rb->setRotation(Quaternionr::Identity());

    g_boundary = new BoundaryModel_Akinci2012();
    g_boundary->initModel(
        rb,
        static_cast<unsigned int>(boundaryParticles.size()),
        const_cast<Vector3r*>(boundaryParticles.data()));
    g_sim->addBoundaryModel(g_boundary);

    // Simulation::deferredInit() initializes fluid point sets only.
    // Add the boundary after that so point-set ordering stays fluid(s) first, boundaries second.
    g_boundary->deferredInit();
    g_sim->performNeighborhoodSearchSort();
    g_sim->updateBoundaryVolume();
    refresh_boundary_positions();
}

int create_freefall_simulation(const int requestedSide)
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
    g_scene = 0;
    g_step_count = 0;
    refresh_positions();
    return static_cast<int>(count);
}

int create_dambreak_simulation(const int requestedResolution)
{
    destroy_simulation();

    const int resolution = std::max(5, std::min(10, requestedResolution));
    const Real particleRadius = static_cast<Real>(0.025);
    const Real spacing = static_cast<Real>(2.0) * particleRadius;

    const int nx = resolution;
    const int nz = resolution;
    const int ny = resolution + 6;
    const unsigned int count = static_cast<unsigned int>(nx * ny * nz);

    std::vector<Vector3r> positions(count);
    std::vector<Vector3r> velocities(count, Vector3r::Zero());
    std::vector<unsigned int> objectIds(count, 0u);

    unsigned int index = 0;
    const Real startX = static_cast<Real>(-0.48);
    const Real startY = static_cast<Real>(0.05);
    const Real halfZ = static_cast<Real>(nz - 1) * spacing * static_cast<Real>(0.5);

    for (int y = 0; y < ny; ++y)
    {
        for (int z = 0; z < nz; ++z)
        {
            for (int x = 0; x < nx; ++x)
            {
                positions[index++] = Vector3r(
                    startX + static_cast<Real>(x) * spacing,
                    startY + static_cast<Real>(y) * spacing,
                    static_cast<Real>(z) * spacing - halfZ);
            }
        }
    }

    g_sim = Simulation::getCurrent();
    g_sim->init(particleRadius, false);
    g_sim->setBoundaryHandlingMethod(BoundaryHandlingMethods::Akinci2012);

    TimeManager::getCurrent()->setTime(static_cast<Real>(0.0));
    TimeManager::getCurrent()->setTimeStepSize(static_cast<Real>(0.001));

    g_sim->addFluidModel(
        "DamBreakFluid",
        count,
        positions.data(),
        velocities.data(),
        objectIds.data(),
        0u);

    g_model = g_sim->getFluidModel(0);
    g_model->setViscosityMethod(1u);

    g_sim->setSimulationMethod(static_cast<int>(SimulationMethods::WCSPH));
    TimeStepWCSPH* wcsph = static_cast<TimeStepWCSPH*>(g_sim->getTimeStep());
    wcsph->setValue(TimeStepWCSPH::STIFFNESS, static_cast<Real>(25000.0));
    wcsph->setValue(TimeStepWCSPH::EXPONENT, static_cast<Real>(1.0));
    g_sim->setValue(Simulation::CFL_FACTOR, static_cast<Real>(1.0));
    g_sim->setValue(Simulation::CFL_MAX_TIMESTEPSIZE, static_cast<Real>(0.005));
    g_sim->setSimulationInitialized(1);

    const std::vector<Vector3r> boundaryParticles = make_open_box_boundary(particleRadius);
    add_akinci_boundary(boundaryParticles);

    g_side = resolution;
    g_scene = 1;
    g_step_count = 0;
    refresh_positions();
    return static_cast<int>(count);
}

float min_particle_y()
{
    if (!g_model || g_model->numActiveParticles() == 0u)
        return 0.0f;

    Real value = g_model->getPosition(0)[1];
    const unsigned int count = g_model->numActiveParticles();
    for (unsigned int i = 1; i < count; ++i)
        value = std::min(value, g_model->getPosition(i)[1]);
    return static_cast<float>(value);
}

float max_particle_x()
{
    if (!g_model || g_model->numActiveParticles() == 0u)
        return 0.0f;

    Real value = g_model->getPosition(0)[0];
    const unsigned int count = g_model->numActiveParticles();
    for (unsigned int i = 1; i < count; ++i)
        value = std::max(value, g_model->getPosition(i)[0]);
    return static_cast<float>(value);
}
}

extern "C" {

EMSCRIPTEN_KEEPALIVE int sph_init(const int side)
{
    return create_freefall_simulation(side);
}

EMSCRIPTEN_KEEPALIVE int sph_init_dambreak(const int resolution)
{
    return create_dambreak_simulation(resolution);
}

EMSCRIPTEN_KEEPALIVE int sph_reset()
{
    if (!g_sim)
    {
        if (g_scene == 1)
            return create_dambreak_simulation(g_side > 0 ? g_side : 6);
        return create_freefall_simulation(g_side > 0 ? g_side : 8);
    }

    g_sim->reset();
    g_step_count = 0;
    refresh_positions();
    refresh_boundary_positions();
    return static_cast<int>(g_model ? g_model->numActiveParticles() : 0u);
}

EMSCRIPTEN_KEEPALIVE int sph_step(const int steps)
{
    if (!g_sim || !g_model || !g_sim->getTimeStep())
        return -1;

    const int count = std::max(0, std::min(2000, steps));
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

EMSCRIPTEN_KEEPALIVE int sph_boundary_count()
{
    return g_boundary ? static_cast<int>(g_boundary->numberOfParticles()) : 0;
}

EMSCRIPTEN_KEEPALIVE const float* sph_boundary_positions_ptr()
{
    return g_boundary_positions.empty() ? nullptr : g_boundary_positions.data();
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

EMSCRIPTEN_KEEPALIVE float sph_min_y()
{
    return min_particle_y();
}

EMSCRIPTEN_KEEPALIVE float sph_max_x()
{
    return max_particle_x();
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

EMSCRIPTEN_KEEPALIVE int sph_scene()
{
    return g_scene;
}


EMSCRIPTEN_KEEPALIVE int sph_point_set_count()
{
    return g_sim ? static_cast<int>(g_sim->numberOfPointSets()) : 0;
}

EMSCRIPTEN_KEEPALIVE int sph_boundary_point_set_index()
{
    return g_boundary ? static_cast<int>(g_boundary->getPointSetIndex()) : -1;
}

EMSCRIPTEN_KEEPALIVE int sph_boundary_neighbor_links()
{
    if (!g_sim || !g_model || !g_boundary)
        return 0;

    g_sim->performNeighborhoodSearch();

    const unsigned int fluidPointSet = g_model->getPointSetIndex();
    const unsigned int boundaryPointSet = g_boundary->getPointSetIndex();
    unsigned int links = 0u;
    const unsigned int count = g_model->numActiveParticles();

    for (unsigned int i = 0; i < count; ++i)
        links += g_sim->numberOfNeighbors(fluidPointSet, boundaryPointSet, i);

    return static_cast<int>(links);
}

EMSCRIPTEN_KEEPALIVE void sph_destroy()
{
    destroy_simulation();
}

}
