if (NOT EMSCRIPTEN)
    message(FATAL_ERROR "splishsplash_wasm_smoke is an Emscripten-only probe")
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
