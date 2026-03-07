#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_centerX;
uniform float u_centerY;
uniform float u_width;
uniform float u_height;
uniform float u_rotation;  // in radians

in vec2 v_uv;
layout(location = 0) out vec4 out_walls;

void main() {
    vec2 pixelCoord = v_uv * u_res;
    vec2 center = vec2(u_centerX, u_centerY) * u_res;
    
    // Translate to origin
    vec2 p = pixelCoord - center;
    
    // Rotate
    float cosA = cos(u_rotation);
    float sinA = sin(u_rotation);
    vec2 rotated = vec2(
        p.x * cosA + p.y * sinA,
        -p.x * sinA + p.y * cosA
    );
    
    // Check if inside rectangle
    float halfWidth = u_width * u_res.x * 0.5;
    float halfHeight = u_height * u_res.y * 0.5;
    
    float isWall = (abs(rotated.x) <= halfWidth && abs(rotated.y) <= halfHeight) ? 1.0 : 0.0;
    
    out_walls = vec4(isWall, 0.0, 0.0, 0.0);
}
