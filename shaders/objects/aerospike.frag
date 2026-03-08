#version 300 es
precision highp float;

uniform vec2  u_res;

uniform float u_centerX;
uniform float u_centerY;

uniform float u_throatRadius;
uniform float u_spikeLength;
uniform float u_convergingLength;
uniform float u_inletRadius;
uniform float u_wallThickness;
uniform float u_truncationRatio;

in vec2 v_uv;
layout(location = 0) out vec4 out_walls;

#define PI 3.14159265359

/* smooth aerospike centerbody contour */
float spikeContour(float x, float Ls, float Rt, float trunc)
{
    float t = clamp(x / Ls, 0.0, 1.0);
    // S-curve provides a smooth fluid transition from an axial throat 
    // to an axial truncated exit without sharp derivative breaks.
    float s = 0.5 + 0.5 * cos(PI * t);
    return mix(Rt * trunc, Rt, s);
}

/* converging outer cowl contour */
float cowlContour(float x, float Lc, float Rin, float Rc0)
{
    float t = clamp((x + Lc) / Lc, 0.0, 1.0);
    // S-curve ensures the chamber outer wall converges smoothly and 
    // exits perfectly axially at the throat.
    float s = 0.5 - 0.5 * cos(PI * t);
    return mix(Rin, Rc0, s);
}

void main()
{
    vec2 pixel = v_uv * u_res;
    vec2 center = vec2(u_centerX, u_centerY) * u_res;

    vec2 p = pixel - center;
    p.x = -p.x;  // flip on X axis

    float Rt   = u_throatRadius    * u_res.y;
    float Rin  = u_inletRadius     * u_res.y;
    float wall = u_wallThickness   * u_res.y;

    float Lc   = u_convergingLength * u_res.x;
    float Ls   = u_spikeLength      * u_res.x;

    float r = abs(p.y);

    float isSolid = 0.0;

    // Outer cowl inner radius at the throat.
    // We intentionally create an annular gap between the spike (Rt) and the cowl.
    // This ensures there's always a physical path for the gas to flow through.
    float throatGap = max((Rin - Rt) * 0.3, wall * 2.0);
    float Rc0 = Rt + throatGap;

    /* ------------------------------------- */
    /* 1. Inlet + Converging Chamber (x <= 0)*/
    /* ------------------------------------- */
    if (p.x <= 0.0)
    {
        // Central Body (inner wall of the annular combustion chamber)
        if (r <= Rt)
        {
            isSolid = 1.0;
        }
        else
        {
            // Outer Cowl (outer wall of the chamber)
            float Rcowl;
            if (p.x < -Lc) {
                Rcowl = Rin;
            } else {
                Rcowl = cowlContour(p.x, Lc, Rin, Rc0);
            }

            // Outer Cowl solid thickness
            if (r >= Rcowl && r <= Rcowl + wall)
            {
                isSolid = 1.0;
            }

            // End walls at entrance to prevent side flow - block everything outside the cowl
            if (r > Rcowl + wall)
            {
                isSolid = 1.0;
            }
        }
    }
    
    /* ------------------------------------- */
    /* 2. Spike Expansion Region (0 < x <= L)*/
    /* ------------------------------------- */
    else if (p.x <= Ls)
    {
        // Central spike expands and tapers inward
        float spikeR = spikeContour(p.x, Ls, Rt, u_truncationRatio);

        if (r <= spikeR)
        {
            isSolid = 1.0;
        }
        
        // Notice there is NO outer cowl code here. The outer cowl effectively 
        // ends at x = 0 to allow external fluid expansion against the atmosphere.
    }
    
    /* ------------------------------------- */
    /* 3. Beyond Spike / Open Plume (x > L)  */
    /* ------------------------------------- */
    else
    {
        // Open fluid domain for the exhaust wake
        isSolid = 0.0;
    }

    out_walls = vec4(isSolid, 0.0, 0.0, 0.0);
}