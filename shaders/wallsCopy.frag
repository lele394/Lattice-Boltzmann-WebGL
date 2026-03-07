#version 300 es
precision highp float;

uniform sampler2D u_walls;
in vec2 v_uv;

layout(location = 0) out vec4 out_walls;

void main() {
    out_walls = texture(u_walls, v_uv);
}
