#version 300 es


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
uniform vec2 u_res;

in vec2 v_uv;
out vec4 outColor;

// Simple Heatmap color function
vec3 heatmap(float v) {
    v = clamp(v, 0.0, 1.0);
    return mix(vec3(0.0, 0.0, 0.5), vec3(1.0, 0.0, 0.0), v); 
    // Transition from Blue (slow) to Red (fast)
}

void main() {
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
    float dilation = 80.0;
    // vec3 speedCol = heatmap(speed * 5.0); 
    vec3 speedCol = heatmap(speed * dilation / (1.0 + speed * dilation)); 

    float densDiff = (rho - 1.0) * 10.0 + 0.5;
    // Safety check for log input
    densDiff = log(max(0.0001, densDiff + 1.0)) / log(1.5); 
    vec3 densCol = vec3(densDiff);

    outColor = vec4(speedCol, 1.0);
    // outColor = vec4(densCol, 1.0);
}