#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_enableBoundaryWalls;  // 0=none, 1=all sides, 2=top/bottom only
in vec2 v_uv;

layout(location = 0) out vec4 out_walls;

void main() {
    vec2 pixelCoord = v_uv * u_res;
    
    float isWall = 0.0;
    float velocityX = 0.0;
    float velocityY = 0.0;
    
    float borderThickness = 4.0;
    
    // Full boundary walls (all sides)
    if (u_enableBoundaryWalls > 0.9 && u_enableBoundaryWalls < 1.1) {
        if (pixelCoord.x < borderThickness || 
            pixelCoord.x > u_res.x - borderThickness ||
            pixelCoord.y < borderThickness || 
            pixelCoord.y > u_res.y - borderThickness) {
            isWall = 1.0;
        }
    }
    // Tunnel walls (top and bottom only)
    else if (u_enableBoundaryWalls > 1.9 && u_enableBoundaryWalls < 2.1) {
        if (pixelCoord.y < borderThickness || 
            pixelCoord.y > u_res.y - borderThickness) {
            isWall = 1.0;
        }
    }
    
    // Wall format: vec4(isWall, velocityX, velocityY, reserved)
    out_walls = vec4(isWall, velocityX, velocityY, 0.0);
}
