export function setupQuad(gl) {
    // 2 Triangles covering the clip space [-1, 1]
    const vertices = new Float32Array([
        -1, -1,   1, -1,  -1,  1,
        -1,  1,   1, -1,   1,  1
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    return buffer;
}








export async function shadersCompiler(gl, shaderConfig) {

    // 2. Helper: Compile a single shader stage
    const createShader = (type, src) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const msg = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compilation error: ${msg}`);
        }
        return shader;
    };

    // 3. Helper: Link VS and FS into a Program
    const createProgram = (vsSrc, fsSrc) => {
        const program = gl.createProgram();
        gl.attachShader(program, createShader(gl.VERTEX_SHADER, vsSrc));
        gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fsSrc));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
        }
        return program;
    };

    // const vsSource = await fetch('shaders/vert.glsl').then(res => res.text());
    // const initSource = await fetch('shaders/init.frag').then(res => res.text());
    // const stepSource = await fetch('shaders/step.glsl').then(res => res.text());
    // const displaySource = await fetch('shaders/display.glsl').then(res => res.text());


    const vsSource = await fetch(shaderConfig.vs).then(res => res.text());
    const initSource = await fetch(shaderConfig.init).then(res => res.text());
    const stepSource = await fetch(shaderConfig.step).then(res => res.text());
    const displaySource = await fetch(shaderConfig.display).then(res => res.text());

    // 5. Build the programs
    return {
        init:    createProgram(vsSource, initSource),
        step:    createProgram(vsSource, stepSource),
        display: createProgram(vsSource, displaySource)
    };
}