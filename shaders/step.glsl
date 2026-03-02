#version 300 es
precision highp float;

// Ping ........
uniform sampler2D u_Q1Q4;
uniform sampler2D u_Q5Q8;
uniform sampler2D u_Q9;

// .... fioufffff .....
in vec2 v_uv;

// ....... Pong 
layout(location = 0) out vec4 out_Q1Q4;
layout(location = 1) out vec4 out_Q5Q8;
layout(location = 2) out float out_Q9;

void main() {
    // Does nothing but stops compilation to scream at me in angry javascript
    out_Q1Q4 = texture(u_Q1Q4, v_uv);
    out_Q5Q8 = texture(u_Q5Q8, v_uv);
    out_Q9   = texture(u_Q9, v_uv).r; 
}