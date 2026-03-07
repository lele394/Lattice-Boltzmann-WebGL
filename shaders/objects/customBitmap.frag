#version 300 es
precision highp float;

uniform vec2 u_res;
uniform sampler2D u_bitmapMask;
uniform vec2 u_bitmapSize;
uniform float u_centerX;
uniform float u_centerY;
uniform float u_scale;
uniform float u_rotation; // radians
uniform float u_flipX;
uniform float u_flipY;
uniform float u_invertMask;

in vec2 v_uv;
layout(location = 0) out vec4 out_walls;

void main() {
    vec2 pixelCoord = v_uv * u_res;
    vec2 center = vec2(u_centerX, u_centerY) * u_res;

    vec2 offset = pixelCoord - center;

    float c = cos(-u_rotation);
    float s = sin(-u_rotation);
    vec2 local = vec2(
        offset.x * c - offset.y * s,
        offset.x * s + offset.y * c
    );

    vec2 scaledSize = max(u_bitmapSize * u_scale, vec2(1.0));
    vec2 uvMask = (local / scaledSize) + vec2(0.5);

    uvMask.y = 1.0 - uvMask.y;

    if (u_flipX > 0.5) {
        uvMask.x = 1.0 - uvMask.x;
    }
    if (u_flipY > 0.5) {
        uvMask.y = 1.0 - uvMask.y;
    }

    bool inside = uvMask.x >= 0.0 && uvMask.x <= 1.0 && uvMask.y >= 0.0 && uvMask.y <= 1.0;
    float sampleValue = 0.0;
    if (inside) {
        sampleValue = texture(u_bitmapMask, uvMask).r;
        if (u_invertMask > 0.5) {
            sampleValue = 1.0 - sampleValue;
        }
    }
    float isWall = sampleValue > 0.5 ? 1.0 : 0.0;

    out_walls = vec4(isWall, 0.0, 0.0, 0.0);
}
