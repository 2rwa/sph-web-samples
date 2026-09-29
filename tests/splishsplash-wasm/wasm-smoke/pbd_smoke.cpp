#include <cmath>
#include <iostream>

#include "SPlisHSPlasH/TimeManager.h"
#include "Simulator/PositionBasedDynamicsWrapper/PBDRigidBody.h"
#include "PositionBasedDynamics/TimeIntegration.h"

int main()
{
    constexpr Real dt = static_cast<Real>(0.01);
    constexpr Real mass = static_cast<Real>(2.0);

    SPH::TimeManager::getCurrent()->setTimeStepSize(dt);

    PBD::RigidBody body;
    const Vector3r x0(0.0, 1.0, 0.0);
    const Quaternionr q0(1.0, 0.0, 0.0, 0.0);

    body.setMass(mass);
    body.setPosition(x0);
    body.setPosition0(x0);
    body.setOldPosition(x0);
    body.setLastPosition(x0);
    body.setVelocity(Vector3r::Zero());
    body.setVelocity0(Vector3r::Zero());
    body.setAcceleration(Vector3r::Zero());

    body.setInertiaTensor(Vector3r::Ones());
    body.setRotation(q0);
    body.setRotation0(q0);
    body.setOldRotation(q0);
    body.setLastRotation(q0);
    body.setRotationMAT(q0);
    body.setRotationInitial(q0);
    body.setPositionInitial_MAT(Vector3r::Zero());
    body.setAngularVelocity(Vector3r::Zero());
    body.setAngularVelocity0(Vector3r::Zero());
    body.setTorque(Vector3r::Zero());
    body.rotationUpdated();

    SPH::PBDRigidBody bridge(&body);
    const bool dynamic = bridge.isDynamic();

    const Vector3r force(0.0, -19.62, 0.0);
    bridge.addForce(force);

    const Real vyAfterForce = body.getVelocity()[1];
    PBD::TimeIntegration::semiImplicitEuler(
        dt,
        body.getMass(),
        body.getPosition(),
        body.getVelocity(),
        Vector3r::Zero());

    const Real y1 = body.getPosition()[1];
    const Real expectedVy = static_cast<Real>(-0.0981);
    const Real expectedY = static_cast<Real>(0.999019);
    const Real eps = static_cast<Real>(1.0e-6);

    const bool ok =
        dynamic &&
        std::abs(vyAfterForce - expectedVy) < eps &&
        std::abs(y1 - expectedY) < eps;

    if (!ok)
    {
        std::cerr << "SPLISHSPLASH_PBD_RIGIDBODY_WASM_FAIL"
                  << " dynamic=" << dynamic
                  << " mass=" << bridge.getMass()
                  << " vy=" << vyAfterForce
                  << " expectedVy=" << expectedVy
                  << " y0=" << x0[1]
                  << " y1=" << y1
                  << " expectedY=" << expectedY
                  << "\n";
        return 31;
    }

    std::cout << "SPLISHSPLASH_PBD_RIGIDBODY_WASM_OK"
              << " dynamic=" << dynamic
              << " mass=" << bridge.getMass()
              << " dt=" << dt
              << " forceY=" << force[1]
              << " vy=" << vyAfterForce
              << " y0=" << x0[1]
              << " y1=" << y1
              << "\n";
    return 0;
}
