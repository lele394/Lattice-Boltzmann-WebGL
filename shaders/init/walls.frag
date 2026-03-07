#version 300 es
precision highp float;

uniform vec2 u_res;
uniform float u_enableBoundaryWalls;
in vec2 v_uv;

layout(location = 0) out vec4 out_walls;

void main() {
    vec2 pixelCoord = v_uv * u_res;
    
    float isWall = 0.0;
    float velocityX = 0.0;
    float velocityY = 0.0;
    
    // Boundary walls (togglable)
    if (u_enableBoundaryWalls > 0.5) {
        float borderThickness = 4.0;
        if (pixelCoord.x < borderThickness || 
            pixelCoord.x > u_res.x - borderThickness ||
            pixelCoord.y < borderThickness || 
            pixelCoord.y > u_res.y - borderThickness) {
            isWall = 1.0;
        }
    }
    
    // Wall format: vec4(isWall, velocityX, velocityY, reserved)
    out_walls = vec4(isWall, velocityX, velocityY, 0.0);
}
