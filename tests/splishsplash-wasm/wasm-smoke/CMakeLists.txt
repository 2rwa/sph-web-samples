if (NOT EMSCRIPTEN)
    message(FATAL_ERROR "SPlisHSPlasH WASM probes are Emscripten-only")
endif()

add_executable(splishsplash_wasm_smoke smoke.cpp)
target_link_libraries(splishsplash_wasm_smoke PRIVATE SPlisHSPlasH)
target_link_options(splishsplash_wasm_smoke PRIVATE
    "-sENVIRONMENT=node"
    "-sEXIT_RUNTIME=1"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sWASM_ASYNC_COMPILATION=0"
    "-sASSERTIONS=1"
)
set_target_properties(splishsplash_wasm_smoke PROPERTIES SUFFIX ".js")

add_executable(splishsplash_sim_smoke sim_api.cpp sim_smoke.cpp)
target_link_libraries(splishsplash_sim_smoke PRIVATE SPlisHSPlasH)
target_link_options(splishsplash_sim_smoke PRIVATE
    "-sENVIRONMENT=node"
    "-sEXIT_RUNTIME=1"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sWASM_ASYNC_COMPILATION=0"
    "-sASSERTIONS=1"
    "-sNODERAWFS=1"
)
set_target_properties(splishsplash_sim_smoke PROPERTIES SUFFIX ".js")

add_executable(splishsplash_browser sim_api.cpp)
target_link_libraries(splishsplash_browser PRIVATE SPlisHSPlasH)
target_link_options(splishsplash_browser PRIVATE
    "--no-entry"
    "-sENVIRONMENT=web"
    "-sMODULARIZE=1"
    "-sEXPORT_NAME=createSPlisHSPlasH"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sASSERTIONS=1"
    "-sEXPORTED_RUNTIME_METHODS=HEAPF32,FS,ccall"
)
set_target_properties(splishsplash_browser PROPERTIES SUFFIX ".js")

# True-dynamic bridge probe. Keep this out of the normal SPH_LIBS_ONLY build:
# Ext_PBD is intentionally compiled only by build-pbd-probe.sh.
add_executable(splishsplash_pbd_smoke EXCLUDE_FROM_ALL pbd_smoke.cpp)
add_dependencies(splishsplash_pbd_smoke Ext_PBD)
target_link_libraries(splishsplash_pbd_smoke PRIVATE
    SPlisHSPlasH
    ${PBD_LIBRARIES}
    PBD_includes
)
target_link_options(splishsplash_pbd_smoke PRIVATE
    "-sENVIRONMENT=node"
    "-sEXIT_RUNTIME=1"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sWASM_ASYNC_COMPILATION=0"
    "-sASSERTIONS=1"
)
set_target_properties(splishsplash_pbd_smoke PROPERTIES SUFFIX ".js")

add_executable(splishsplash_pbd_coupling_smoke EXCLUDE_FROM_ALL
    sim_api.cpp
    pbd_coupling_smoke.cpp
)
add_dependencies(splishsplash_pbd_coupling_smoke Ext_PBD)
target_compile_definitions(splishsplash_pbd_coupling_smoke PRIVATE SPLISHSPLASH_ENABLE_PBD=1)
target_link_libraries(splishsplash_pbd_coupling_smoke PRIVATE
    SPlisHSPlasH
    ${PBD_LIBRARIES}
    PBD_includes
)
target_link_options(splishsplash_pbd_coupling_smoke PRIVATE
    "-sENVIRONMENT=node"
    "-sEXIT_RUNTIME=1"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sWASM_ASYNC_COMPILATION=0"
    "-sASSERTIONS=1"
    "-sNODERAWFS=1"
)
set_target_properties(splishsplash_pbd_coupling_smoke PROPERTIES SUFFIX ".js")

add_executable(splishsplash_pbd_coupling_sweep EXCLUDE_FROM_ALL
    sim_api.cpp
    pbd_coupling_sweep.cpp
)
add_dependencies(splishsplash_pbd_coupling_sweep Ext_PBD)
target_compile_definitions(splishsplash_pbd_coupling_sweep PRIVATE SPLISHSPLASH_ENABLE_PBD=1)
target_link_libraries(splishsplash_pbd_coupling_sweep PRIVATE
    SPlisHSPlasH
    ${PBD_LIBRARIES}
    PBD_includes
)
target_link_options(splishsplash_pbd_coupling_sweep PRIVATE
    "-sENVIRONMENT=node"
    "-sEXIT_RUNTIME=1"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sWASM_ASYNC_COMPILATION=0"
    "-sASSERTIONS=1"
    "-sNODERAWFS=1"
)
set_target_properties(splishsplash_pbd_coupling_sweep PROPERTIES SUFFIX ".js")

add_executable(splishsplash_pbd_browser EXCLUDE_FROM_ALL sim_api.cpp)
add_dependencies(splishsplash_pbd_browser Ext_PBD)
target_compile_definitions(splishsplash_pbd_browser PRIVATE SPLISHSPLASH_ENABLE_PBD=1)
target_link_libraries(splishsplash_pbd_browser PRIVATE
    SPlisHSPlasH
    ${PBD_LIBRARIES}
    PBD_includes
)
target_link_options(splishsplash_pbd_browser PRIVATE
    "--no-entry"
    "-sENVIRONMENT=web"
    "-sMODULARIZE=1"
    "-sEXPORT_NAME=createSPlisHSPlasHPBD"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sASSERTIONS=1"
    "-sEXPORTED_RUNTIME_METHODS=HEAPF32,FS,ccall"
)
set_target_properties(splishsplash_pbd_browser PROPERTIES SUFFIX ".js")

add_executable(splishsplash_pbd_gravity_sweep EXCLUDE_FROM_ALL
    sim_api.cpp
    pbd_gravity_impact_sweep.cpp
)
add_dependencies(splishsplash_pbd_gravity_sweep Ext_PBD)
target_compile_definitions(splishsplash_pbd_gravity_sweep PRIVATE SPLISHSPLASH_ENABLE_PBD=1)
target_link_libraries(splishsplash_pbd_gravity_sweep PRIVATE
    SPlisHSPlasH
    ${PBD_LIBRARIES}
    PBD_includes
)
target_link_options(splishsplash_pbd_gravity_sweep PRIVATE
    "-sENVIRONMENT=node"
    "-sEXIT_RUNTIME=1"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sWASM_ASYNC_COMPILATION=0"
    "-sASSERTIONS=1"
    "-sNODERAWFS=1"
)
set_target_properties(splishsplash_pbd_gravity_sweep PROPERTIES SUFFIX ".js")

add_executable(splishsplash_pbd_timestep_smoke EXCLUDE_FROM_ALL
    pbd_timestep_smoke.cpp
)
add_dependencies(splishsplash_pbd_timestep_smoke Ext_PBD)
target_link_libraries(splishsplash_pbd_timestep_smoke PRIVATE
    SPlisHSPlasH
    ${PBD_LIBRARIES}
    PBD_includes
)
target_link_options(splishsplash_pbd_timestep_smoke PRIVATE
    "-sENVIRONMENT=node"
    "-sEXIT_RUNTIME=1"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sWASM_ASYNC_COMPILATION=0"
    "-sASSERTIONS=1"
)
set_target_properties(splishsplash_pbd_timestep_smoke PROPERTIES SUFFIX ".js")

add_executable(splishsplash_pbd_upstream_coupling_smoke EXCLUDE_FROM_ALL
    sim_api.cpp
    pbd_upstream_coupling_smoke.cpp
)
add_dependencies(splishsplash_pbd_upstream_coupling_smoke Ext_PBD)
target_compile_definitions(splishsplash_pbd_upstream_coupling_smoke PRIVATE SPLISHSPLASH_ENABLE_PBD=1)
target_link_libraries(splishsplash_pbd_upstream_coupling_smoke PRIVATE
    SPlisHSPlasH
    ${PBD_LIBRARIES}
    PBD_includes
)
target_link_options(splishsplash_pbd_upstream_coupling_smoke PRIVATE
    "-sENVIRONMENT=node"
    "-sEXIT_RUNTIME=1"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sWASM_ASYNC_COMPILATION=0"
    "-sASSERTIONS=1"
    "-sNODERAWFS=1"
)
set_target_properties(splishsplash_pbd_upstream_coupling_smoke PROPERTIES SUFFIX ".js")

add_executable(splishsplash_pbd_motor_smoke EXCLUDE_FROM_ALL
    pbd_motor_hinge_smoke.cpp
)
add_dependencies(splishsplash_pbd_motor_smoke Ext_PBD)
target_link_libraries(splishsplash_pbd_motor_smoke PRIVATE
    SPlisHSPlasH
    ${PBD_LIBRARIES}
    PBD_includes
)
target_link_options(splishsplash_pbd_motor_smoke PRIVATE
    "-sENVIRONMENT=node"
    "-sEXIT_RUNTIME=1"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sWASM_ASYNC_COMPILATION=0"
    "-sASSERTIONS=1"
)
set_target_properties(splishsplash_pbd_motor_smoke PROPERTIES SUFFIX ".js")
