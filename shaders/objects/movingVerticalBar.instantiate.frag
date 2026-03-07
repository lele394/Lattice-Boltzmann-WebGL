#version 300 es
precision highp float;

uniform vec2 u_res;
in vec2 v_uv;

layout(location = 0) out vec4 out_walls;

void main() {
    float isWall = 0.0;

    // Vertical wall centered at (0.5, 0.5)
    // Height = 0.2, thin width for a bar-like wall
    float centerX = 0.5;
    float centerY = 0.5;
    float halfHeight = 0.1;
    float halfWidth = 0.008;

    if (abs(v_uv.x - centerX) <= halfWidth && abs(v_uv.y - centerY) <= halfHeight) {
        isWall = 1.0;
    }

    out_walls = vec4(isWall, 0.0, 0.0, 0.0);
}
