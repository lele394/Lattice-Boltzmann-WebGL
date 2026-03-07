#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_centerX;
uniform float u_centerY;
uniform float u_size;
uniform float u_rotation;  // in radians

in vec2 v_uv;
layout(location = 0) out vec4 out_walls;

// Function to check if point is inside triangle
float local_sign(vec2 p1, vec2 p2, vec2 p3) {
    return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

bool pointInTriangle(vec2 pt, vec2 v1, vec2 v2, vec2 v3) {
    float d1 = local_sign(pt, v1, v2);
    float d2 = local_sign(pt, v2, v3);
    float d3 = local_sign(pt, v3, v1);
    
    bool hasNeg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
    bool hasPos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);
    
    return !(hasNeg && hasPos);
}

void main() {
    vec2 pixelCoord = v_uv * u_res;
    vec2 center = vec2(u_centerX, u_centerY) * u_res;
    float scale = u_size * min(u_res.x, u_res.y);
    
    // Define equilateral triangle vertices (pointing up initially)
    vec2 v1 = vec2(0.0, -0.577);      // top
    vec2 v2 = vec2(-0.5, 0.289);      // bottom left
    vec2 v3 = vec2(0.5, 0.289);       // bottom right
    
    // Rotate vertices
    float cosA = cos(u_rotation);
    float sinA = sin(u_rotation);
    
    vec2 rv1 = vec2(v1.x * cosA - v1.y * sinA, v1.x * sinA + v1.y * cosA) * scale + center;
    vec2 rv2 = vec2(v2.x * cosA - v2.y * sinA, v2.x * sinA + v2.y * cosA) * scale + center;
    vec2 rv3 = vec2(v3.x * cosA - v3.y * sinA, v3.x * sinA + v3.y * cosA) * scale + center;
    
    float isWall = pointInTriangle(pixelCoord, rv1, rv2, rv3) ? 1.0 : 0.0;
    
    out_walls = vec4(isWall, 0.0, 0.0, 0.0);
}
