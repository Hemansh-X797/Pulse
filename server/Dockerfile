# Use official Ubuntu runtime as base
FROM ubuntu:24.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install C++ toolchain, CMake, Ninja, and OpenSSL / Postgres dependencies
RUN apt update && apt install -y \
    build-essential \
    cmake \
    ninja-build \
    g++ \
    libssl-dev \
    libpq-dev \
    sqlite3 \
    libsqlite3-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy server code into container
WORKDIR /app
COPY . .

# Build C++ project
RUN mkdir -p build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release -G Ninja && \
    ninja

# Expose default HTTP/WS port
EXPOSE 8080

# Run the compiled binary
CMD ["/app/build/pulse_server"]