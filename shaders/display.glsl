#version 300 es


// Hello world shader
// precision highp float;
// out vec4 outColor;
// void main() {
//     // shader hellow world
//     vec2 uv = gl_FragCoord.xy / vec2(800, 600);
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
    // sample D2Q9 distribution functions
    vec4 q14 = texture(u_Q1Q4, v_uv);
    vec4 q58 = texture(u_Q5Q8, v_uv);
    float q9 = texture(u_Q9, v_uv).r;

    // Density
    float rho = q14.x + q14.y + q14.z + q14.w + 
                q58.x + q58.y + q58.z + q58.w + q9;

    // Velocity
    // 1:(1,0), 2:(0,1), 3:(-1,0), 4:(0,-1)
    // 5:(1,1), 6:(-1,1), 7:(-1,-1), 8:(1,-1)
    float ux = (q14.x - q14.z + q58.x - q58.y - q58.z + q58.w);
    float uy = (q14.y - q14.w + q58.x + q58.y - q58.z - q58.w);
    
    // Normalisation
    vec2 vel = vec2(ux, uy) / rho;
    float speed = length(vel);

    // Visualization modes
    
    // Speed
    vec3 speedCol = heatmap(speed * 5.0); 

    // Density
    float densDiff = (rho - 1.0) * 10.0 + 0.5;
    vec3 densCol = vec3(densDiff);

    // Output Velocity Speed by default
    // outColor = vec4(speedCol, 1.0);
    outColor = vec4(densCol, 1.0);
}