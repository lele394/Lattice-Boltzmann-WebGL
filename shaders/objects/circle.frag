#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_centerX;
uniform float u_centerY;
uniform float u_radius;

in vec2 v_uv;
layout(location = 0) out vec4 out_walls;

void main() {
    vec2 pixelCoord = v_uv * u_res;
    vec2 center = vec2(u_centerX, u_centerY) * u_res;
    float radius = u_radius * min(u_res.x, u_res.y);
    
    float dist = distance(pixelCoord, center);
    float isWall = (dist <= radius) ? 1.0 : 0.0;
    
    out_walls = vec4(isWall, 0.0, 0.0, 0.0);
}
