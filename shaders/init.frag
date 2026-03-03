#version 300 es
precision highp float;


// Stole that from Gemini


in vec2 v_uv;

layout(location = 0) out vec4 out_Q1Q4;
layout(location = 1) out vec4 out_Q5Q8;
layout(location = 2) out float out_Q9;

void main() {

    // 1. Define macroscopic variables (Standard Background)
    float rho = 1.0;
    vec2 u = vec2(0.0, 0.0); // Background is still

    // 2. Create the "Ink Drop" effect
    // Calculate distance from center (0.5, 0.5)
    float dist = distance(v_uv, vec2(0.5, 0.5));

    // If inside a circle of radius 0.1...
    if (dist < 0.1) {
        rho = 1.1;             // Slightly higher pressure
        u = vec2(0.2, 0.1);    // Moving diagonally
    }

    // 3. LBM Constants (D2Q9)
    // Order: 0:E, 1:N, 2:W, 3:S, 4:NE, 5:NW, 6:SW, 7:SE, 8:Center
    float w[9] = float[](1./9., 1./9., 1./9., 1./9., 1./36., 1./36., 1./36., 1./36., 4./9.);
    vec2 e[9] = vec2[](
        vec2(1,0), vec2(0,1), vec2(-1,0), vec2(0,-1),
        vec2(1,1), vec2(-1,1), vec2(-1,-1), vec2(1,-1),
        vec2(0,0)
    );

    // 4. Calculate Equilibrium Distribution (feq)
    // This turns our macro rho/u into the 9 discrete populations
    float f[9];
    for(int i = 0; i < 9; i++) {
        float eu = dot(e[i], u);
        float uu = dot(u, u);
        f[i] = w[i] * rho * (1.0 + 3.0*eu + 4.5*eu*eu - 1.5*uu);
    }

    // 5. Write to the 3 textures
    out_Q1Q4 = vec4(f[0], f[1], f[2], f[3]);
    out_Q5Q8 = vec4(f[4], f[5], f[6], f[7]);
    out_Q9   = f[8];
}