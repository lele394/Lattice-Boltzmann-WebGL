#version 300 es
precision highp float;


// Stole that from Gemini


in vec2 v_uv;

layout(location = 0) out vec4 out_Q1Q4;
layout(location = 1) out vec4 out_Q5Q8;
layout(location = 2) out float out_Q9;

void main() {
    float rho = 1.0;
    vec2 u = vec2(0.0, 0.0);
    if (distance(v_uv, vec2(0.5)) < 0.1) {
        rho = 1.6;
        u = vec2(0.02, 0.0);
    }

    float w[] = float[](4./9., 1./9., 1./9., 1./9., 1./9., 1./36., 1./36., 1./36., 1./36.);
    vec2 e[] = vec2[](vec2(0,0), vec2(1,0), vec2(0,1), vec2(-1,0), vec2(0,-1), vec2(1,1), vec2(-1,1), vec2(-1,-1), vec2(1,-1));

    float f[9];
    for(int i=0; i<9; i++) {
        float eu = dot(e[i], u);
        f[i] = w[i] * rho * (1.0 + 3.0*eu + 4.5*eu*eu - 1.5*dot(u,u));
    }

    out_Q9 = f[0];
    out_Q1Q4 = vec4(f[1], f[2], f[3], f[4]);
    out_Q5Q8 = vec4(f[5], f[6], f[7], f[8]);
}