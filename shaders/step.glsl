#version 300 es
precision highp float;

uniform sampler2D u_Q1Q4, u_Q5Q8, u_Q9;
uniform vec2 u_res;
in vec2 v_uv;

layout(location = 0) out vec4 out_Q1Q4;
layout(location = 1) out vec4 out_Q5Q8;
layout(location = 2) out float out_Q9;

void main() {

    /*
    It was easier to just use the raw formulas instead of the matrix form for some reason.
    I hate maths,
    And programming.
    Why is physics a pain, jeez.

    Notes : 
    I keep doing reordering and de-reordering, but I'm not sure if it's actually necessary.
    This is room for improvement on the day I'll be at peace with those maths.
    */

    float tau = 0.7; // Relaxation time (must be > 0.5 for stability, higher = more viscous)
    vec2 px = 1.0 / u_res;

    // --- STREAMING (PULL) ---
    // Pull from the opposite direction
    float f0 = texture(u_Q9,   v_uv).r;                         
    float f1 = texture(u_Q1Q4, v_uv + vec2(-px.x,  0.0)).r;
    float f2 = texture(u_Q1Q4, v_uv + vec2( 0.0, -px.y)).g;
    float f3 = texture(u_Q1Q4, v_uv + vec2( px.x,  0.0)).b;
    float f4 = texture(u_Q1Q4, v_uv + vec2( 0.0,  px.y)).a;
    float f5 = texture(u_Q5Q8, v_uv + vec2(-px.x, -px.y)).r;
    float f6 = texture(u_Q5Q8, v_uv + vec2( px.x, -px.y)).g;
    float f7 = texture(u_Q5Q8, v_uv + vec2( px.x,  px.y)).b;
    float f8 = texture(u_Q5Q8, v_uv + vec2(-px.x,  px.y)).a;

    // --- MACRO ---
    float rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
    float jx  = (f1 - f3 + f5 - f6 - f7 + f8);
    float jy  = (f2 - f4 + f5 + f6 - f7 - f8);
    float u = jx / rho;
    float v = jy / rho;
    float u2v2 = u*u + v*v;

    // --- FORWARD TRANSFORM (m = M * f) ---

    // I've spent so much time on this, Copilot found the ordering error in seconds, I hate everything
    // Reorder our populations to match reference code ordering for M matrix
    // Reference: [(0,0), E, SE, S, SW, W, NW, N, NE]
    // Ours:      [(0,0), E, N, W, S, NE, NW, SW, SE]
    float fr[9]; // reordered
    // I could just fucking load it that way yk. But I CBA changing it for now
    fr[0] = f0; fr[1] = f1; fr[2] = f8; fr[3] = f4; fr[4] = f7;
    fr[5] = f3; fr[6] = f6; fr[7] = f2; fr[8] = f5;
    
    // Apply ref M
    float m0 = rho;
    float m1 = -4.0*fr[0] - fr[1] + 2.0*fr[2] - fr[3] + 2.0*fr[4] - fr[5] + 2.0*fr[6] - fr[7] + 2.0*fr[8];
    float m2 =  4.0*fr[0] - 2.0*(fr[1]+fr[2]+fr[3]+fr[4]) + (fr[5]+fr[6]+fr[7]+fr[8]);
    float m3 = jx;
    float m4 = -2.0*fr[1] + fr[2] - fr[4] + 2.0*fr[5] - fr[6] + fr[8];
    float m5 = jy;
    float m6 = -fr[2] + 2.0*fr[3] - fr[4] + fr[6] - 2.0*fr[7] + fr[8];
    float m7 = fr[1] - fr[3] + fr[5] - fr[7];
    float m8 = -fr[2] + fr[4] - fr[6] + fr[8];

    // --- COLLISION ---
    // Relaxation rates matching reference C code from Gábor Závodszky
    float s1=1.001, s2=1.001, s4=1.001, s6=1.001, s7=1.0/tau, s8=1.0/tau;

    // Equilibrium
    float e_eq   = rho * (-2.0 + 3.0*u2v2);
    float eps_eq = rho * (1.0 - 3.0*u2v2);
    float qx_eq  = rho * (-u);
    float qy_eq  = rho * (-v);
    float pxx_eq = rho * (u*u - v*v);
    float pxy_eq = rho * u * v;

    m1 -= s1 * (m1 - e_eq);
    m2 -= s2 * (m2 - eps_eq);
    m4 -= s4 * (m4 - qx_eq);
    m6 -= s6 * (m6 - qy_eq);
    m7 -= s7 * (m7 - pxx_eq);
    m8 -= s8 * (m8 - pxy_eq);

    // --- INVERSE TRANSFORM (f = M^-1 * m) --- 
    // Apply reference Minv matrix to get reordered populations, thanks wolfram
    float fnr[9]; // fn reordered
    /*
    COmpiler should optimize constant ops
    But the amount of shit I could cache here is insane
    I'll do it eventually
    */
    fnr[0] = (1.0/9.0) * (m0 - m1 + m2);
    fnr[1] = (1.0/36.0) * (4.0*m0 - m1 - 2.0*m2 + 6.0*m3 - 6.0*m4 + 9.0*m7);
    fnr[2] = (1.0/36.0) * (4.0*m0 + 2.0*m1 + m2 + 6.0*m3 + 3.0*m4 - 6.0*m5 - 3.0*m6 - 9.0*m8);
    fnr[3] = (1.0/36.0) * (4.0*m0 - m1 - 2.0*m2 - 6.0*m5 + 6.0*m6 - 9.0*m7);
    fnr[4] = (1.0/36.0) * (4.0*m0 + 2.0*m1 + m2 - 6.0*m3 - 3.0*m4 - 6.0*m5 - 3.0*m6 + 9.0*m8);
    fnr[5] = (1.0/36.0) * (4.0*m0 - m1 - 2.0*m2 - 6.0*m3 + 6.0*m4 + 9.0*m7);
    fnr[6] = (1.0/36.0) * (4.0*m0 + 2.0*m1 + m2 - 6.0*m3 - 3.0*m4 + 6.0*m5 + 3.0*m6 - 9.0*m8);
    fnr[7] = (1.0/36.0) * (4.0*m0 - m1 - 2.0*m2 + 6.0*m5 - 6.0*m6 - 9.0*m7);
    fnr[8] = (1.0/36.0) * (4.0*m0 + 2.0*m1 + m2 + 6.0*m3 + 3.0*m4 + 6.0*m5 + 3.0*m6 + 9.0*m8);
    
    // Reorder back to our population ordering. Really necessary?
    // float fn[9];
    // fn[0] = fnr[0]; fn[1] = fnr[1]; fn[2] = fnr[7]; fn[3] = fnr[5]; fn[4] = fnr[3];
    // fn[5] = fnr[8]; fn[6] = fnr[6]; fn[7] = fnr[4]; fn[8] = fnr[2];

    // out_Q1Q4 = vec4(fn[1], fn[2], fn[3], fn[4]);
    // out_Q5Q8 = vec4(fn[5], fn[6], fn[7], fn[8]);
    // out_Q9 = fn[0];

    // Skipping reordering and direct to output
    out_Q1Q4 = vec4(fnr[1], fnr[7], fnr[5], fnr[3]);
    out_Q5Q8 = vec4(fnr[8], fnr[6], fnr[4], fnr[2]);
    out_Q9 = fnr[0];


    // BGK Collision step, We replacing it with MRT, but leaving it here for reference
    // // "Collision" => relax to equilibrium
    // // Forgot to say but it's good ol' taylor expansion of the Maxwell-Boltzmann distribution
    // // Fuck I hate maths, but oh well, can't do shit without em
    // for(int i = 0; i < 9; i++) {
    //     float eu = dot(e[i], u);
    //     float uu = dot(u, u);
    //     float feq = w[i] * rho * (1.0 + 3.0*eu + 4.5*eu*eu - 1.5*uu);
        
    //     // Relax the current distribution toward equilibrium
    //     f[i] = f[i] + omega * (feq - f[i]);
    // }

    // // returns
    // out_Q1Q4 = vec4(f[0], f[1], f[2], f[3]);
    // out_Q5Q8 = vec4(f[4], f[5], f[6], f[7]);
    // out_Q9   = f[8];
}