#version 300 es
precision highp float;

uniform sampler2D u_Q1Q4; // f0, f1, f2, f3
uniform sampler2D u_Q5Q8; // f4, f5, f6, f7
uniform sampler2D u_Q9;   // f8
uniform vec2 u_res;

in vec2 v_uv;

layout(location = 0) out vec4 out_Q1Q4;
layout(location = 1) out vec4 out_Q5Q8;
layout(location = 2) out float out_Q9;

void main() {
    // --- CONSTANTS ---
    // Liquid settings
    // Might switch to uniform
    float tau = 0.6; 
    float omega = 1.0 / tau;

    // LBM stuff
    float w[9] = float[](1./9., 1./9., 1./9., 1./9., 1./36., 1./36., 1./36., 1./36., 4./9.);
    vec2 e[9] = vec2[](
        vec2(1,0), vec2(0,1), vec2(-1,0), vec2(0,-1),   // 0, 1, 2, 3
        vec2(1,1), vec2(-1,1), vec2(-1,-1), vec2(1,-1), // 4, 5, 6, 7
        vec2(0,0)                                       // 8
    );

    // Pulling from neighbors
    vec2 pixelSize = 1.0 / u_res;

    float f[9];
    // actual neighbor lookup is here (obviously)
    // Q1Q4
    f[0] = texture(u_Q1Q4, v_uv - e[0] * pixelSize).r;
    f[1] = texture(u_Q1Q4, v_uv - e[1] * pixelSize).g;
    f[2] = texture(u_Q1Q4, v_uv - e[2] * pixelSize).b;
    f[3] = texture(u_Q1Q4, v_uv - e[3] * pixelSize).a;

    // Q5Q8
    f[4] = texture(u_Q5Q8, v_uv - e[4] * pixelSize).r;
    f[5] = texture(u_Q5Q8, v_uv - e[5] * pixelSize).g;
    f[6] = texture(u_Q5Q8, v_uv - e[6] * pixelSize).b;
    f[7] = texture(u_Q5Q8, v_uv - e[7] * pixelSize).a;

    //Q9
    f[8] = texture(u_Q9, v_uv).r; // Stationaries don't move

    // Macro vars
    float rho = 0.0;
    vec2 u = vec2(0.0);
    for(int i = 0; i < 9; i++) {
        rho += f[i];
        u += f[i] * e[i];
    }
    u /= rho;

    // "Collision" => relax to equilibrium
    for(int i = 0; i < 9; i++) {
        float eu = dot(e[i], u);
        float uu = dot(u, u);
        float feq = w[i] * rho * (1.0 + 3.0*eu + 4.5*eu*eu - 1.5*uu);
        
        // Relax the current distribution toward equilibrium
        f[i] = f[i] + omega * (feq - f[i]);
    }

    // returns
    out_Q1Q4 = vec4(f[0], f[1], f[2], f[3]);
    out_Q5Q8 = vec4(f[4], f[5], f[6], f[7]);
    out_Q9   = f[8];
}