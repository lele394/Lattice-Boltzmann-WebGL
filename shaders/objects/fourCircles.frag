#version 300 es
precision highp float;

uniform vec2 u_res;
in vec2 v_uv;

layout(location = 0) out vec4 out_walls;

void main() {
    vec2 pixelCoord = v_uv * u_res;
    vec2 center = u_res * 0.5;
    
    float isWall = 0.0;
    float velocityX = 0.0;
    float velocityY = 0.0;
    
    // Four circles at distance 0.3 from center
    float radiusPx = u_res.x * 0.05; // Size 0.1 (10% of width)
    float distanceFromCenter = u_res.x * 0.3; // At 0.3 from center
    
    vec2 circlePositions[4];
    circlePositions[0] = center + vec2(distanceFromCenter, 0.0);  // Right
    circlePositions[1] = center + vec2(-distanceFromCenter, 0.0); // Left
    circlePositions[2] = center + vec2(0.0, distanceFromCenter);  // Bottom
    circlePositions[3] = center + vec2(0.0, -distanceFromCenter); // Top
    
    // Check if pixel is inside any of the circles
    for (int i = 0; i < 4; i++) {
        if (distance(pixelCoord, circlePositions[i]) < radiusPx) {
            isWall = 1.0;
            break;
        }
    }
    
    // Wall format: vec4(isWall, velocityX, velocityY, reserved)
    out_walls = vec4(isWall, velocityX, velocityY, 0.0);
}
