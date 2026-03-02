#version 300 es
precision highp float;

layout(location = 0) out vec4 out_Q1Q4;
layout(location = 1) out vec4 out_Q5Q8;
layout(location = 2) out float out_Q9;

void main() {
    // Initial state
    float rho = 1.0; 
    vec2 u = vec2(0.05, 0.0); // Initial velocity (slight breeze to the right)

    // LBM Constants
    float w[9] = float[](1./9., 1./9., 1./9., 1./9., 1./36., 1./36., 1./36., 1./36., 4./9.);
    vec2 e[9] = vec2[](
        vec2(1,0), vec2(0,1), vec2(-1,0), vec2(0,-1), // Axis
        vec2(1,1), vec2(-1,1), vec2(-1,-1), vec2(1,-1), // Diagonals
        vec2(0,0) // Stationary (Q9)
    );

    float f[9];
    for(int i = 0; i < 9; i++) {
        float eu = dot(e[i], u);
        float uu = dot(u, u);
        // Magic math stuff for equilibrium
        f[i] = w[i] * rho * (1.0 + 3.0*eu + 4.5*eu*eu - 1.5*uu);
    }

    out_Q1Q4 = vec4(f[0], f[1], f[2], f[3]);
    out_Q5Q8 = vec4(f[4], f[5], f[6], f[7]);
    out_Q9   = f[8];
}