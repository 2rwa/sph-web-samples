#include <cmath>
#include <iostream>

#include "Common/Common.h"
#include "Simulation/Constraints.h"
#include "Simulation/Simulation.h"
#include "Simulation/SimulationModel.h"
#include "Simulation/TimeManager.h"
#include "Utils/Timing.h"

INIT_TIMING

namespace {

PBD::RigidBody* makeBody(
    const Real mass,
    const Vector3r& position,
    const Vector3r& inertia)
{
    const Quaternionr q0(1.0, 0.0, 0.0, 0.0);
    PBD::RigidBody* body = new PBD::RigidBody();
    body->setMass(mass);
    body->setPosition(position);
    body->setPosition0(position);
    body->setOldPosition(position);
    body->setLastPosition(position);
    body->setVelocity(Vector3r::Zero());
    body->setVelocity0(Vector3r::Zero());
    body->setAcceleration(Vector3r::Zero());
    body->setInertiaTensor(inertia);
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
    return body;
}

}

int main()
{
    constexpr Real dt = static_cast<Real>(0.005);
    constexpr Real mass = static_cast<Real>(200.0);
    constexpr Real target = static_cast<Real>(-6.0);

    PBD::SimulationModel model;
    model.init();

    PBD::Simulation* simulation = PBD::Simulation::getCurrent();
    simulation->setModel(&model);
    Vector3r gravity = Vector3r::Zero();
    simulation->setVecValue<Real>(PBD::Simulation::GRAVITATION, &gravity[0]);
    PBD::TimeManager::getCurrent()->setTime(static_cast<Real>(0.0));
    PBD::TimeManager::getCurrent()->setTimeStepSize(dt);

    PBD::RigidBody* anchor = makeBody(
        static_cast<Real>(0.0),
        Vector3r(0.0, 0.0, 0.0),
        Vector3r::Ones());

    const Real sx = static_cast<Real>(1.0);
    const Real sy = static_cast<Real>(0.1);
    const Real sz = static_cast<Real>(0.2);
    const Real oneTwelfth = static_cast<Real>(1.0 / 12.0);
    const Vector3r inertia(
        oneTwelfth * mass * (sy * sy + sz * sz),
        oneTwelfth * mass * (sx * sx + sz * sz),
        oneTwelfth * mass * (sx * sx + sy * sy));

    PBD::RigidBody* motorBody = makeBody(
        mass,
        Vector3r(0.0, 0.1, 0.0),
        inertia);

    model.getRigidBodies().push_back(anchor);
    model.getRigidBodies().push_back(motorBody);

    const bool jointAdded = model.addTargetVelocityMotorHingeJoint(
        1u,
        0u,
        Vector3r(0.0, 0.0, 0.0),
        Vector3r(0.0, 1.0, 0.0));

    auto& constraints = model.getConstraints();
    if (!jointAdded || constraints.empty())
    {
        std::cerr << "SPLISHSPLASH_PBD_MOTOR_WASM_FAIL jointAdded="
                  << jointAdded
                  << " constraints=" << constraints.size()
                  << "\n";
        delete simulation;
        return 91;
    }

    PBD::MotorJoint* motor = static_cast<PBD::MotorJoint*>(constraints.back());
    motor->setTarget(target);

    const Quaternionr q0 = motorBody->getRotation();
    for (int i = 0; i < 40; ++i)
        simulation->getTimeStep()->step(model);

    const Quaternionr q1 = motorBody->getRotation();
    const Vector3r omega = motorBody->getAngularVelocity();
    const Vector3r anchorPos = anchor->getPosition();
    const Real pbdTime = PBD::TimeManager::getCurrent()->getTime();
    const Real rotationDelta = (q1.coeffs() - q0.coeffs()).norm();

    const bool finite =
        motorBody->getPosition().allFinite() &&
        omega.allFinite() &&
        q1.coeffs().allFinite();

    const bool ok =
        finite &&
        std::abs(anchorPos.norm()) < static_cast<Real>(1.0e-7) &&
        std::abs(omega[1]) > static_cast<Real>(0.1) &&
        rotationDelta > static_cast<Real>(1.0e-4) &&
        pbdTime > static_cast<Real>(0.1);

    if (!ok)
    {
        std::cerr << "SPLISHSPLASH_PBD_MOTOR_WASM_FAIL"
                  << " omega=" << omega.transpose()
                  << " rotationDelta=" << rotationDelta
                  << " anchorNorm=" << anchorPos.norm()
                  << " time=" << pbdTime
                  << "\n";
        delete simulation;
        return 92;
    }

    std::cout << "SPLISHSPLASH_PBD_MOTOR_WASM_OK"
              << " target=" << target
              << " omegaY=" << omega[1]
              << " rotationDelta=" << rotationDelta
              << " anchorNorm=" << anchorPos.norm()
              << " time=" << pbdTime
              << "\n";

    delete simulation;
    return 0;
}
