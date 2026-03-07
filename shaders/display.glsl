#version 300 es


/*

Should probably paramterize color scheme

gist_ncar is pretty neat tho



*/





// Hello world shader
// precision highp float;
// out vec4 outColor;
// void main() {
//     // shader hellow world
//     vec2 uv = gl_FragCoord.xy / vec2(800, 600); // Modify that
//     outColor = vec4(uv.x, uv.y, 1.0 - uv.x, 1.0);
// }


precision highp float;

uniform sampler2D u_Q1Q4;
uniform sampler2D u_Q5Q8;
uniform sampler2D u_Q9;
uniform sampler2D u_walls;
uniform vec2 u_res;
uniform float u_visualizationMode;
uniform vec2 u_densityRange;
uniform vec2 u_velocityRange;

in vec2 v_uv;
out vec4 outColor;

// Simple Heatmap color function
vec3 heatmap(float v) {
    v = clamp(v, 0.0, 1.0);
    return mix(vec3(0.0, 0.0, 0.5), vec3(1.0, 0.0, 0.0), v); 
    // Transition from Blue (slow) to Red (fast)
}

vec3 gist_ncar(float t) {
    t = clamp(t, 0.0, 1.0);

    vec3 c0 = vec3(0.000, 0.000, 0.502); // dark blue
    vec3 c1 = vec3(0.000, 0.314, 1.000); // blue
    vec3 c2 = vec3(0.000, 0.875, 1.000); // cyan
    vec3 c3 = vec3(0.000, 1.000, 0.498); // green-cyan
    vec3 c4 = vec3(1.000, 1.000, 0.000); // yellow
    vec3 c5 = vec3(1.000, 0.498, 0.000); // orange
    vec3 c6 = vec3(1.000, 0.000, 0.000); // red
    vec3 c7 = vec3(0.878, 0.000, 1.000); // magenta

    if (t < 1.0 / 7.0) return mix(c0, c1, t * 7.0);
    if (t < 2.0 / 7.0) return mix(c1, c2, (t - 1.0 / 7.0) * 7.0);
    if (t < 3.0 / 7.0) return mix(c2, c3, (t - 2.0 / 7.0) * 7.0);
    if (t < 4.0 / 7.0) return mix(c3, c4, (t - 3.0 / 7.0) * 7.0);
    if (t < 5.0 / 7.0) return mix(c4, c5, (t - 4.0 / 7.0) * 7.0);
    if (t < 6.0 / 7.0) return mix(c5, c6, (t - 5.0 / 7.0) * 7.0);
    return mix(c6, c7, (t - 6.0 / 7.0) * 7.0);
}

float normalizeInRange(float value, vec2 rangeMinMax) {
    float span = max(rangeMinMax.y - rangeMinMax.x, 1e-6);
    return clamp((value - rangeMinMax.x) / span, 0.0, 1.0);
}

void main() {
    // Check for walls first
    vec4 wallData = texture(u_walls, v_uv);
    if (wallData.r > 0.5) {
        // Display walls in black
        outColor = vec4(1.0, 1.0, 0.0, 1.0);
        return;
    }
    
    float f0 = texture(u_Q9, v_uv).r;
    vec4 f14 = texture(u_Q1Q4, v_uv);
    vec4 f58 = texture(u_Q5Q8, v_uv);

    float rho = f0 + f14.x + f14.y + f14.z + f14.w + f58.x + f58.y + f58.z + f58.w;
    // Velocity calculation MUST match the MRT momenta (jx, jy)
    float ux = (f14.x - f14.z + f58.x - f58.y - f58.z + f58.w) / rho;
    float uy = (f14.y - f14.w + f58.x + f58.y - f58.z - f58.w) / rho;

    float speed = length(vec2(ux, uy));

    // --- DEBUG: CHECK FOR EXPLOSION ---
    // isinf() catches infinity, isnan() catches math errors
    // also checking if rho <= 0.0 which is a common cause of LBM death
    bool exploded = isnan(rho) || isinf(rho) || isnan(speed) || isinf(speed) || rho <= 0.0 || speed > 2.0;

    if (exploded) {
        outColor = vec4(0.0, 1.0, 0.0, 1.0); // Bright Green
        return; 
    }

    // 3. Normal Visualization
    // float dilation = 80.0;
    // vec3 speedCol = heatmap(speed * 5.0); 
    // vec3 speedCol = heatmap(speed * dilation / (1.0 + speed * dilation)); 

    float densityT = normalizeInRange(rho, u_densityRange);
    float velocityT = normalizeInRange(speed, u_velocityRange);
    float useVelocity = step(0.5, u_visualizationMode);
    float t = mix(densityT, velocityT, useVelocity);

    outColor = vec4(gist_ncar(t), 1.0);
}