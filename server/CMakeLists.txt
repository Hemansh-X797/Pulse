cmake_minimum_required(VERSION 3.16)
project(pulse_server LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

add_executable(pulse_server
    src/main.cpp
    third_party/sqlite3.c
)

target_include_directories(pulse_server PRIVATE
    third_party
    src
)

find_package(Threads REQUIRED)
find_package(OpenSSL REQUIRED)
target_link_libraries(pulse_server PRIVATE Threads::Threads dl OpenSSL::SSL OpenSSL::Crypto)

target_compile_options(pulse_server PRIVATE -O2 -Wall -Wextra -Wno-unused-parameter)
