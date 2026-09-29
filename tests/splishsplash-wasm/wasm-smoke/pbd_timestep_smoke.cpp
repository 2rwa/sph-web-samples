#include <cmath>
#include <iostream>

#include "SPlisHSPlasH/TimeManager.h"
#include "Simulator/PositionBasedDynamicsWrapper/PBDRigidBody.h"
#include "Simulation/Simulation.h"
#include "Simulation/SimulationModel.h"
#include "Simulation/TimeManager.h"

int main()
{
    constexpr Real dt = static_cast<Real>(0.01);
    constexpr Real mass = static_cast<Real>(2.0);
    const Vector3r x0(0.0, 1.0, 0.0);
    const Quaternionr q0(1.0, 0.0, 0.0, 0.0);

    SPH::TimeManager::getCurrent()->setTimeStepSize(dt);

    PBD::SimulationModel model;
    model.init();

    PBD::Simulation* simulation = PBD::Simulation::getCurrent();
    simulation->setModel(&model);
    const Vector3r gravity = Vector3r::Zero();
    simulation->setVecValue<Real>(PBD::Simulation::GRAVITATION, &gravity[0]);
    PBD::TimeManager::getCurrent()->setTime(static_cast<Real>(0.0));
    PBD::TimeManager::getCurrent()->setTimeStepSize(dt);

    PBD::RigidBody* body = new PBD::RigidBody();
    body->setMass(mass);
    body->setPosition(x0);
    body->setPosition0(x0);
    body->setOldPosition(x0);
    body->setLastPosition(x0);
    body->setVelocity(Vector3r::Zero());
    body->setVelocity0(Vector3r::Zero());
    body->setAcceleration(Vector3r::Zero());
    body->setInertiaTensor(Vector3r::Ones());
    body->setRotation(q0);
    body->setRotation0(q0);
    body->setOldRotation(q0);
    body->setLastRotation(q0);
    body->setRotationMAT(q0);
    body->setRotationInitial(q0);
    body->setPositionInitial_MAT(Vector3r::Zero());
    body->setAngularVelocity(Vector3r::Zero());
    body->setAngularVelocity0(Vector3r::Zero());
    body->setTorque(Vector3r::Zero());
    body->rotationUpdated();
    model.getRigidBodies().push_back(body);

    SPH::PBDRigidBody bridge(body);
    const Vector3r force(0.0, -19.62, 0.0);
    bridge.addForce(force);
    const Real vyAfterForce = body->getVelocity()[1];

    simulation->getTimeStep()->step(model);

    const Real y1 = body->getPosition()[1];
    const Real pbdTime = PBD::TimeManager::getCurrent()->getTime();
    const Real expectedVy = static_cast<Real>(-0.0981);
    const Real expectedY = static_cast<Real>(0.999019);
    const Real eps = static_cast<Real>(2.0e-6);

    const bool ok =
        bridge.isDynamic() &&
        std::abs(vyAfterForce - expectedVy) < eps &&
        std::abs(body->getVelocity()[1] - expectedVy) < eps &&
        std::abs(y1 - expectedY) < eps &&
        std::abs(pbdTime - dt) < eps;

    if (!ok)
    {
        std::cerr << "SPLISHSPLASH_PBD_TIMESTEP_WASM_FAIL"
                  << " dynamic=" << bridge.isDynamic()
                  << " vyAfterForce=" << vyAfterForce
                  << " vyAfterStep=" << body->getVelocity()[1]
                  << " y1=" << y1
                  << " pbdTime=" << pbdTime
                  << "\n";
        delete simulation;
        return 71;
    }

    std::cout << "SPLISHSPLASH_PBD_TIMESTEP_WASM_OK"
              << " dynamic=" << bridge.isDynamic()
              << " mass=" << mass
              << " dt=" << dt
              << " forceY=" << force[1]
              << " vy=" << body->getVelocity()[1]
              << " y0=" << x0[1]
              << " y1=" << y1
              << " pbdTime=" << pbdTime
              << "\n";

    delete simulation;
    return 0;
}
