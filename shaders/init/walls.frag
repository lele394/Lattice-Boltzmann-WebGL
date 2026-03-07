#version 300 es
precision highp float;

uniform vec2 u_res;
in vec2 v_uv;

layout(location = 0) out vec4 out_walls;


/*
Copilot made that
*/


void main() {
    vec2 pixelCoord = v_uv * u_res;
    
    // Example 1: Border walls (uncomment to use)
    float borderThickness = 4.0;
    float isWall = 0.0;
    float velocityX = 0.0;
    float velocityY = 0.0;
    
    if (pixelCoord.x < borderThickness || 
        pixelCoord.x > u_res.x - borderThickness ||
        pixelCoord.y < borderThickness || 
        pixelCoord.y > u_res.y - borderThickness) {
        isWall = 1.0;
    }
    
    // Static vertical wall in the middle (for now)
    float obstacleX = u_res.x * 0.5;
    float obstacleWidth = 10.0;
    if (abs(pixelCoord.x - obstacleX) < obstacleWidth && 
        pixelCoord.y > u_res.y * 0.3 && 
        pixelCoord.y < u_res.y * 0.7) {
        isWall = 1.0;
        // Disable moving wall for now - causes instability
        // velocityX = 0.02;
        // velocityY = 0.0;
    }
    
    // Wall format: vec4(isWall, velocityX, velocityY, reserved)
    out_walls = vec4(isWall, velocityX, velocityY, 0.0);
}
