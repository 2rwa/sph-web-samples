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
    "-sEXPORTED_RUNTIME_METHODS=HEAPF32"
)
set_target_properties(splishsplash_browser PROPERTIES SUFFIX ".js")
