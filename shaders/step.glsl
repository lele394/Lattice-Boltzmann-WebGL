#version 300 es
precision highp float;

uniform sampler2D u_Q1Q4, u_Q5Q8, u_Q9, u_walls, u_prevWalls;
uniform vec2 u_res;
uniform float u_boundaryMode; // 0=wrap, 1=boundary, 2=open, 3=airflowTunnel
uniform float u_tunnelVelocity;
in vec2 v_uv;

layout(location = 0) out vec4 out_Q1Q4;
layout(location = 1) out vec4 out_Q5Q8;
layout(location = 2) out float out_Q9;

// For open boundaries and airflow tunnel: equilibrium population calculation with velocity
float equilibriumPop(int dir, float u, float v) {
    float rho0 = 1.0;
    float uu = u*u + v*v;
    
    if (dir == 0) {
        return (4.0/9.0) * rho0 * (1.0 - 1.5 * uu);
    } else if (dir == 1) {
        // E direction: e = (+1, 0), e·u = u
        return (1.0/9.0) * rho0 * (1.0 + 3.0*u + 4.5*u*u - 1.5*uu);
    } else if (dir == 3) {
        // W direction: e = (-1, 0), e·u = -u
        return (1.0/9.0) * rho0 * (1.0 - 3.0*u + 4.5*u*u - 1.5*uu);
    } else if (dir == 2) {
        // N direction: e = (0, +1), e·u = v
        return (1.0/9.0) * rho0 * (1.0 + 3.0*v + 4.5*v*v - 1.5*uu);
    } else if (dir == 4) {
        // S direction: e = (0, -1), e·u = -v
        return (1.0/9.0) * rho0 * (1.0 - 3.0*v + 4.5*v*v - 1.5*uu);
    } else if (dir == 5) {
        // NE diagonal: e = (+1, +1), e·u = u + v
        float eu = u + v;
        return (1.0/36.0) * rho0 * (1.0 + 3.0*eu + 4.5*eu*eu - 1.5*uu);
    } else if (dir == 6) {
        // NW diagonal: e = (-1, +1), e·u = -u + v
        float eu = -u + v;
        return (1.0/36.0) * rho0 * (1.0 + 3.0*eu + 4.5*eu*eu - 1.5*uu);
    } else if (dir == 7) {
        // SW diagonal: e = (-1, -1), e·u = -u - v
        float eu = -u - v;
        return (1.0/36.0) * rho0 * (1.0 + 3.0*eu + 4.5*eu*eu - 1.5*uu);
    } else {
        // SE diagonal (dir == 8): e = (+1, -1), e·u = u - v
        float eu = u - v;
        return (1.0/36.0) * rho0 * (1.0 + 3.0*eu + 4.5*eu*eu - 1.5*uu);
    }
}

void main() {

    /*
    It was easier to just use the raw formulas instead of the matrix form for some reason.
    I hate maths,
    And programming.
    Why is physics a pain, jeez.

    Notes : 
    I keep doing reordering and de-reordering, but I'm not sure if it's actually necessary.
    This is room for improvement on the day I'll be at peace with those maths.

    For the wall stuff, maybe can avoide redoing the whole matrix math after that.
    */

    float tau = 0.6; // Relaxation time (must be > 0.5 for stability, higher = more viscous)
    vec2 px = 1.0 / u_res;

    // --- STREAMING (PULL) ---
    // Pull from the opposite direction
    // For open boundaries:
    //   - Incoming: Cells pull from outside -> use equilibrium (rho=1, u=0)
    //   - Outgoing: Populations streaming out aren't pulled by anyone -> destroyed
    // For airflow tunnel:
    //   - Right edge: inject leftward velocity (inflow)
    //   - Left edge: open outflow
    //   - Top/bottom: walls (handled by wall texture)
    bool isOpenMode = u_boundaryMode > 1.5 && u_boundaryMode < 2.5;  // Only 'open' mode
    bool isAirflowTunnel = u_boundaryMode > 2.9 && u_boundaryMode < 3.1;
    
    vec2 uv0 = v_uv;
    vec2 uv1 = v_uv + vec2(-px.x,  0.0);  // Pull E from W
    vec2 uv2 = v_uv + vec2( 0.0, -px.y);  // Pull N from S
    vec2 uv3 = v_uv + vec2( px.x,  0.0);  // Pull W from E
    vec2 uv4 = v_uv + vec2( 0.0,  px.y);  // Pull S from N
    vec2 uv5 = v_uv + vec2(-px.x, -px.y); // Pull NE from SW
    vec2 uv6 = v_uv + vec2( px.x, -px.y); // Pull NW from SE
    vec2 uv7 = v_uv + vec2( px.x,  px.y); // Pull SW from NE
    vec2 uv8 = v_uv + vec2(-px.x,  px.y); // Pull SE from NW
    
    // For standard open mode: all boundaries are open
    // For airflow tunnel: only left/right are open, top/bottom are walls
    bool out1, out2, out3, out4, out5, out6, out7, out8;
    
    if (isAirflowTunnel) {
        // Airflow tunnel: left/right open, top/bottom closed (walls)
        out1 = (uv1.x <= 0.0 || uv1.x >= 1.0);
        out2 = false;  // Top/bottom handled by walls
        out3 = (uv3.x <= 0.0 || uv3.x >= 1.0);
        out4 = false;  // Top/bottom handled by walls
        out5 = (uv5.x <= 0.0 || uv5.x >= 1.0);
        out6 = (uv6.x <= 0.0 || uv6.x >= 1.0);
        out7 = (uv7.x <= 0.0 || uv7.x >= 1.0);
        out8 = (uv8.x <= 0.0 || uv8.x >= 1.0);
    } else {
        // Open mode: all boundaries open
        out1 = isOpenMode && (uv1.x <= 0.0 || uv1.x >= 1.0 || uv1.y <= 0.0 || uv1.y >= 1.0);
        out2 = isOpenMode && (uv2.x <= 0.0 || uv2.x >= 1.0 || uv2.y <= 0.0 || uv2.y >= 1.0);
        out3 = isOpenMode && (uv3.x <= 0.0 || uv3.x >= 1.0 || uv3.y <= 0.0 || uv3.y >= 1.0);
        out4 = isOpenMode && (uv4.x <= 0.0 || uv4.x >= 1.0 || uv4.y <= 0.0 || uv4.y >= 1.0);
        out5 = isOpenMode && (uv5.x <= 0.0 || uv5.x >= 1.0 || uv5.y <= 0.0 || uv5.y >= 1.0);
        out6 = isOpenMode && (uv6.x <= 0.0 || uv6.x >= 1.0 || uv6.y <= 0.0 || uv6.y >= 1.0);
        out7 = isOpenMode && (uv7.x <= 0.0 || uv7.x >= 1.0 || uv7.y <= 0.0 || uv7.y >= 1.0);
        out8 = isOpenMode && (uv8.x <= 0.0 || uv8.x >= 1.0 || uv8.y <= 0.0 || uv8.y >= 1.0);
    }
    
    // For airflow tunnel: inject velocity when pulling from RIGHT boundary (x >= 1.0)
    // Directions pulling from right (uv.x >= 1.0): 3 (W), 6 (NW), 7 (SW)
    float u_eq1 = 0.0;
    float u_eq2 = 0.0;
    float u_eq3 = (isAirflowTunnel && uv3.x >= 1.0) ? u_tunnelVelocity : 0.0;  // Pull W from right edge
    float u_eq4 = 0.0;
    float u_eq5 = 0.0;
    float u_eq6 = (isAirflowTunnel && uv6.x >= 1.0) ? u_tunnelVelocity : 0.0;  // Pull NW from right edge
    float u_eq7 = (isAirflowTunnel && uv7.x >= 1.0) ? u_tunnelVelocity : 0.0;  // Pull SW from right edge
    float u_eq8 = 0.0;
    
    float f0 = texture(u_Q9,   uv0).r;
    float f1 = out1 ? equilibriumPop(1, u_eq1, 0.0) : texture(u_Q1Q4, uv1).r;
    float f2 = out2 ? equilibriumPop(2, u_eq2, 0.0) : texture(u_Q1Q4, uv2).g;
    float f3 = out3 ? equilibriumPop(3, u_eq3, 0.0) : texture(u_Q1Q4, uv3).b;
    float f4 = out4 ? equilibriumPop(4, u_eq4, 0.0) : texture(u_Q1Q4, uv4).a;
    float f5 = out5 ? equilibriumPop(5, u_eq5, 0.0) : texture(u_Q5Q8, uv5).r;
    float f6 = out6 ? equilibriumPop(6, u_eq6, 0.0) : texture(u_Q5Q8, uv6).g;
    float f7 = out7 ? equilibriumPop(7, u_eq7, 0.0) : texture(u_Q5Q8, uv7).b;
    float f8 = out8 ? equilibriumPop(8, u_eq8, 0.0) : texture(u_Q5Q8, uv8).a;

    vec4 wallData = texture(u_walls, v_uv);
    vec4 prevWallData = texture(u_prevWalls, v_uv);
    float isWall = wallData.r;
    float wallVelX = wallData.g;
    float wallVelY = wallData.b;
    float wasWall = prevWallData.r;

    float rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;

    // Fluid cell that has just been uncovered by moving wall: reinitialize from equilibrium
    if (isWall <= 0.5 && wasWall > 0.5) {
        float u0 = prevWallData.g;
        float v0 = prevWallData.b;
        float rho0 = 1.0;
        float uv2 = u0 * u0 + v0 * v0;

        float fe0 = (4.0/9.0) * rho0 * (1.0 - 1.5 * uv2);
        float fe1 = (1.0/9.0) * rho0 * (1.0 + 3.0*u0 + 4.5*u0*u0 - 1.5*uv2); // E
        float fe2 = (1.0/9.0) * rho0 * (1.0 + 3.0*v0 + 4.5*v0*v0 - 1.5*uv2); // N
        float fe3 = (1.0/9.0) * rho0 * (1.0 - 3.0*u0 + 4.5*u0*u0 - 1.5*uv2); // W
        float fe4 = (1.0/9.0) * rho0 * (1.0 - 3.0*v0 + 4.5*v0*v0 - 1.5*uv2); // S
        float fe5 = (1.0/36.0) * rho0 * (1.0 + 3.0*(u0+v0) + 4.5*(u0+v0)*(u0+v0) - 1.5*uv2); // NE
        float fe6 = (1.0/36.0) * rho0 * (1.0 + 3.0*(-u0+v0) + 4.5*(-u0+v0)*(-u0+v0) - 1.5*uv2); // NW
        float fe7 = (1.0/36.0) * rho0 * (1.0 + 3.0*(-u0-v0) + 4.5*(-u0-v0)*(-u0-v0) - 1.5*uv2); // SW
        float fe8 = (1.0/36.0) * rho0 * (1.0 + 3.0*(u0-v0) + 4.5*(u0-v0)*(u0-v0) - 1.5*uv2); // SE

        out_Q1Q4 = vec4(fe1, fe2, fe3, fe4);
        out_Q5Q8 = vec4(fe5, fe6, fe7, fe8);
        out_Q9 = fe0;
        return;
    }

    // Cell that just became wall: initialize as wall-equilibrium first to avoid hard shocks
    if (isWall > 0.5 && wasWall <= 0.5) {
        float rho0 = 1.0;
        float cardCoeff = (2.0 / 3.0) * rho0;
        float diagCoeff = (1.0 / 6.0) * rho0;

        float b0 = (4.0/9.0) * rho0;
        float b1 = (1.0/9.0) * rho0 + cardCoeff * wallVelX;
        float b2 = (1.0/9.0) * rho0 + cardCoeff * wallVelY;
        float b3 = (1.0/9.0) * rho0 - cardCoeff * wallVelX;
        float b4 = (1.0/9.0) * rho0 - cardCoeff * wallVelY;
        float b5 = (1.0/36.0) * rho0 + diagCoeff * ( wallVelX + wallVelY);
        float b6 = (1.0/36.0) * rho0 + diagCoeff * (-wallVelX + wallVelY);
        float b7 = (1.0/36.0) * rho0 + diagCoeff * (-wallVelX - wallVelY);
        float b8 = (1.0/36.0) * rho0 + diagCoeff * ( wallVelX - wallVelY);

        out_Q1Q4 = vec4(b1, b2, b3, b4);
        out_Q5Q8 = vec4(b5, b6, b7, b8);
        out_Q9 = b0;
        return;
    }

    // Solid cell: bounce-back + moving wall correction
    if (isWall > 0.5) {
        float rho0 = 1.0;
        float cardCoeff = (2.0 / 3.0) * rho0; // 6 * w_card * rho0
        float diagCoeff = (1.0 / 6.0) * rho0; // 6 * w_diag * rho0

        float b0 = f0;
        float b1 = f3 + cardCoeff * wallVelX;                 // E from W
        float b2 = f4 + cardCoeff * wallVelY;                 // N from S
        float b3 = f1 - cardCoeff * wallVelX;                 // W from E
        float b4 = f2 - cardCoeff * wallVelY;                 // S from N
        float b5 = f7 + diagCoeff * ( wallVelX + wallVelY);   // NE from SW
        float b6 = f8 + diagCoeff * (-wallVelX + wallVelY);   // NW from SE
        float b7 = f5 + diagCoeff * (-wallVelX - wallVelY);   // SW from NE
        float b8 = f6 + diagCoeff * ( wallVelX - wallVelY);   // SE from NW

        out_Q1Q4 = vec4(b1, b2, b3, b4);
        out_Q5Q8 = vec4(b5, b6, b7, b8);
        out_Q9 = b0;
        return;
    }

    // --- MACRO ---
    float safeRho = max(rho, 1e-8);
    float jx  = (f1 - f3 + f5 - f6 - f7 + f8);
    float jy  = (f2 - f4 + f5 + f6 - f7 - f8);
    float u = jx / safeRho;
    float v = jy / safeRho;
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
    vec4 outQ1Q4 = vec4(fnr[1], fnr[7], fnr[5], fnr[3]);
    vec4 outQ5Q8 = vec4(fnr[8], fnr[6], fnr[4], fnr[2]);
    float outQ9 = fnr[0];

    // Open boundary absorption layer (sponge): damp perturbations near domain edges
    // This reduces wave reflections while keeping outside state at rho=1, u=0.
    if (isOpenMode) {
        float edgeDistPx = min(
            min(v_uv.x, 1.0 - v_uv.x) * u_res.x,
            min(v_uv.y, 1.0 - v_uv.y) * u_res.y
        );

        float spongeWidthPx = 24.0;
        float edgeFactor = clamp((spongeWidthPx - edgeDistPx) / spongeWidthPx, 0.0, 1.0);
        float absorb = edgeFactor * edgeFactor;

        vec4 eqQ1Q4 = vec4(1.0/9.0, 1.0/9.0, 1.0/9.0, 1.0/9.0);
        vec4 eqQ5Q8 = vec4(1.0/36.0, 1.0/36.0, 1.0/36.0, 1.0/36.0);
        float eqQ9 = 4.0/9.0;

        outQ1Q4 = mix(outQ1Q4, eqQ1Q4, absorb);
        outQ5Q8 = mix(outQ5Q8, eqQ5Q8, absorb);
        outQ9 = mix(outQ9, eqQ9, absorb);
    }

    out_Q1Q4 = outQ1Q4;
    out_Q5Q8 = outQ5Q8;
    out_Q9 = outQ9;


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