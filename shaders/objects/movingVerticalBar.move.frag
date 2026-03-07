#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_iteration;
in vec2 v_uv;

layout(location = 0) out vec4 out_walls;

void main() {
    float isWall = 0.0;
    float velocityX = 0.0;

    // Sinusoidal horizontal motion between x=0.3 and x=0.7
    const float PI = 3.14159265358979323846;
    float period = 8000.0;
    float phase = 2.0 * PI * (u_iteration / period);
    float centerX = 0.5 + 0.22 * sin(phase); // [0.3, 0.7]

    // Velocity in lattice units (cells per step), clamped for stability
    float dCenterX_dIter = 0.2 * (2.0 * PI / period) * cos(phase);
    float barVelocityX = dCenterX_dIter * u_res.x; //clamp(dCenterX_dIter * u_res.x, -0.03, 0.03);

    // Vertical wall centered on y=0.5 with height 0.2
    float centerY = 0.5;
    float halfHeight = 0.1;
    float halfWidth = 0.008;

    if (abs(v_uv.x - centerX) <= halfWidth && abs(v_uv.y - centerY) <= halfHeight) {
        isWall = 1.0;
        velocityX = barVelocityX;
    }

    out_walls = vec4(isWall, velocityX, 0.0, 0.0);
}
