#version 300 es
precision highp float;

uniform sampler2D u_Q1Q4, u_Q5Q8, u_Q9, u_walls, u_prevWalls;
uniform vec2 u_res;
uniform float u_boundaryMode; // 0=wrap, 1=boundary, 2=open, 3=airflowTunnel
uniform float u_tunnelVelocity;
uniform float u_tau;
uniform float u_s1, u_s2, u_s4, u_s6, u_s7, u_s8; // MRT relaxation rates
in vec2 v_uv;

layout(location = 0) out vec4 out_Q1Q4;
layout(location = 1) out vec4 out_Q5Q8;
layout(location = 2) out float out_Q9;

// Equilibrium population for D2Q9 using current ordering:
// 0, E(1), N(2), W(3), S(4), NE(5), NW(6), SW(7), SE(8)
float equilibriumPop(int dir, float rho0, float u, float v) {
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

    float tau = u_tau; // Relaxation time (must be > 0.5 for stability, higher = more viscous)
    vec2 px = 1.0 / u_res;

    // MRT Relaxation rates (configurable via UI)
    float s1 = u_s1;
    float s2 = u_s2;
    float s4 = u_s4;
    float s6 = u_s6;
    float s7 = u_s7; // Typically 1.0/tau
    float s8 = u_s8; // Typically 1.0/tau

    // --- STREAMING (PULL) ---
    // Pull from the opposite direction
    // Boundary treatment in this pass:
    // - Open mode: Zou/He pressure boundaries (rho=1) on all sides
    // - Airflow tunnel: right velocity inlet (u_tunnelVelocity), left pressure outlet (rho=1)
    //   Top/bottom remain walls via wall texture
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
    
    float f0 = texture(u_Q9,   uv0).r;
    float f1 = texture(u_Q1Q4, uv1).r;
    float f2 = texture(u_Q1Q4, uv2).g;
    float f3 = texture(u_Q1Q4, uv3).b;
    float f4 = texture(u_Q1Q4, uv4).a;
    float f5 = texture(u_Q5Q8, uv5).r;
    float f6 = texture(u_Q5Q8, uv6).g;
    float f7 = texture(u_Q5Q8, uv7).b;
    float f8 = texture(u_Q5Q8, uv8).a;

    vec4 wallData = texture(u_walls, v_uv);
    vec4 prevWallData = texture(u_prevWalls, v_uv);
    float isWall = wallData.r;
    float wallVelX = wallData.g;
    float wallVelY = wallData.b;
    float wasWall = prevWallData.r;

    // --- ZOU/HE BOUNDARIES (before macro/collision) ---
    // Apply only on fluid cells in boundary-driven modes.
    if ((isOpenMode || isAirflowTunnel) && isWall <= 0.5) {
        ivec2 cell = ivec2(gl_FragCoord.xy - vec2(0.5));
        int nx = int(u_res.x + 0.5);
        int ny = int(u_res.y + 0.5);
        bool atLeft = (cell.x == 0);
        bool atRight = (cell.x == nx - 1);
        bool atBottom = (cell.y == 0);
        bool atTop = (cell.y == ny - 1);

        if (isAirflowTunnel) {
            if (atRight) {
                // Right boundary: velocity inlet (unknown: f3, f6, f7)
                float ux = u_tunnelVelocity;
                float uy = 0.0;
                float rhoBC = (f0 + f2 + f4 + 2.0 * (f1 + f5 + f8)) / (1.0 + ux);

                f3 = f1 - (2.0 / 3.0) * rhoBC * ux;
                f6 = f8 + 0.5 * (f4 - f2) + 0.5 * rhoBC * uy - (1.0 / 6.0) * rhoBC * ux;
                f7 = f5 + 0.5 * (f2 - f4) - 0.5 * rhoBC * uy - (1.0 / 6.0) * rhoBC * ux;
            } else if (atLeft) {
                // Left boundary: pressure outlet rho=1 (unknown: f1, f5, f8)
                float rhoBC = 1.0;
                float ux = 1.0 - (f0 + f2 + f4 + 2.0 * (f3 + f6 + f7)) / rhoBC;
                float uy = 0.0;

                f1 = f3 + (2.0 / 3.0) * rhoBC * ux;
                f5 = f7 + 0.5 * (f4 - f2) + 0.5 * rhoBC * uy + (1.0 / 6.0) * rhoBC * ux;
                f8 = f6 + 0.5 * (f2 - f4) - 0.5 * rhoBC * uy + (1.0 / 6.0) * rhoBC * ux;
            }
        } else if (isOpenMode) {
            // Open mode: pressure boundaries rho=1 on all edges.
            // At corners, use x-boundary priority (left/right), then y-boundary.
            if (atLeft) {
                float rhoBC = 1.0;
                float ux = 1.0 - (f0 + f2 + f4 + 2.0 * (f3 + f6 + f7)) / rhoBC;
                float uy = 0.0;

                f1 = f3 + (2.0 / 3.0) * rhoBC * ux;
                f5 = f7 + 0.5 * (f4 - f2) + 0.5 * rhoBC * uy + (1.0 / 6.0) * rhoBC * ux;
                f8 = f6 + 0.5 * (f2 - f4) - 0.5 * rhoBC * uy + (1.0 / 6.0) * rhoBC * ux;
            } else if (atRight) {
                float rhoBC = 1.0;
                float ux = -1.0 + (f0 + f2 + f4 + 2.0 * (f1 + f5 + f8)) / rhoBC;
                float uy = 0.0;

                f3 = f1 - (2.0 / 3.0) * rhoBC * ux;
                f6 = f8 + 0.5 * (f4 - f2) + 0.5 * rhoBC * uy - (1.0 / 6.0) * rhoBC * ux;
                f7 = f5 + 0.5 * (f2 - f4) - 0.5 * rhoBC * uy - (1.0 / 6.0) * rhoBC * ux;
            } else if (atBottom) {
                float rhoBC = 1.0;
                float ux = 0.0;
                float uy = 1.0 - (f0 + f1 + f3 + 2.0 * (f4 + f7 + f8)) / rhoBC;

                f2 = f4 + (2.0 / 3.0) * rhoBC * uy;
                f5 = f7 + 0.5 * (f3 - f1) + 0.5 * rhoBC * ux + (1.0 / 6.0) * rhoBC * uy;
                f6 = f8 + 0.5 * (f1 - f3) - 0.5 * rhoBC * ux + (1.0 / 6.0) * rhoBC * uy;
            } else if (atTop) {
                float rhoBC = 1.0;
                float ux = 0.0;
                float uy = -1.0 + (f0 + f1 + f3 + 2.0 * (f2 + f5 + f6)) / rhoBC;

                f4 = f2 - (2.0 / 3.0) * rhoBC * uy;
                f7 = f5 + 0.5 * (f1 - f3) - 0.5 * rhoBC * ux - (1.0 / 6.0) * rhoBC * uy;
                f8 = f6 + 0.5 * (f3 - f1) + 0.5 * rhoBC * ux - (1.0 / 6.0) * rhoBC * uy;
            }
        }
    }

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

    // Airflow tunnel: apply absorption layer on LEFT edge (outflow) to prevent reflections
    if (isAirflowTunnel) {
        // Only apply absorption on the left side (x < some threshold)
        float leftDistPx = v_uv.x * u_res.x;
        float spongeWidthPx = 32.0;
        float leftFactor = clamp((spongeWidthPx - leftDistPx) / spongeWidthPx, 0.0, 1.0);
        float absorb = leftFactor * leftFactor;
        
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