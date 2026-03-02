#version 300 es
precision highp float;
out vec4 outColor;

void main() {
    // shader hellow world
    vec2 uv = gl_FragCoord.xy / vec2(800, 600);
    outColor = vec4(uv.x, uv.y, 1.0 - uv.x, 1.0);
}