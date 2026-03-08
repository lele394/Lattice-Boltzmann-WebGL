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
        const vs = createShader(gl.VERTEX_SHADER, vsSrc);
        const fs = createShader(gl.FRAGMENT_SHADER, fsSrc);
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const linkLog = gl.getProgramInfoLog(program);
            console.error('Program link failed:');
            console.error('Link log:', linkLog);
            console.error('Vertex shader source:', vsSrc.substring(0, 200));
            console.error('Fragment shader source:', fsSrc.substring(0, 500));
            throw new Error(`Program link error: ${linkLog}`);
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
    const wallInitSource = await fetch(shaderConfig.wallInit).then(res => res.text());

    const programs = {
        init: createProgram(vsSource, initSource),
        step: createProgram(vsSource, stepSource),
        display: createProgram(vsSource, displaySource),
        wallInit: createProgram(vsSource, wallInitSource)
    };

    const reservedKeys = new Set(['vs', 'init', 'step', 'display', 'wallInit']);
    for (const key of Object.keys(shaderConfig)) {
        if (reservedKeys.has(key)) continue;
        const fsSource = await fetch(shaderConfig[key]).then(res => res.text());
        programs[key] = createProgram(vsSource, fsSource);
    }

    return programs;
}