import { setupBuffers } from './inits.js';
import { createFBO } from './fbo.js';
import { setupQuad } from './shader_helper.js';
import { shadersCompiler } from './shader_helper.js';


const shaderConfig = {
    vs: 'shaders/vert.glsl',
    init: 'shaders/init/inkDrop.frag',
    step: 'shaders/step.glsl',
    display: 'shaders/display.glsl'
};



async function grab() {
    const canvas = document.getElementById('lbm-canvas');
    const gl = canvas.getContext('webgl2');

    if (!gl) {
        console.error("WebGL2 not supported");
        return;
    }

    return { canvas, gl };
}





function bindLBMTextures(gl, program, textures) {
    // Bind Q1Q4 to Unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.Q1Q4);
    gl.uniform1i(gl.getUniformLocation(program, "u_Q1Q4"), 0);

    // Bind Q5Q8 to Unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.Q5Q8);
    gl.uniform1i(gl.getUniformLocation(program, "u_Q5Q8"), 1);

    // Bind Q9 to Unit 2
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textures.Q9);
    gl.uniform1i(gl.getUniformLocation(program, "u_Q9"), 2);
}



function runStep(gl, programs, readState, writeState, canvas) {
    // LBM Step
    gl.useProgram(programs.step);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeState.fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    bindLBMTextures(gl, programs.step, readState);
    
    // params
    const resLoc = gl.getUniformLocation(programs.step, "u_res");
    if (resLoc !== null) gl.uniform2f(resLoc, canvas.width, canvas.height);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawDisplay(gl, programs, stateToDisplay, canvas) {
    gl.useProgram(programs.display);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    
    bindLBMTextures(gl, programs.display, stateToDisplay);
    
    const resLocDisp = gl.getUniformLocation(programs.display, "u_res");
    if (resLocDisp !== null) gl.uniform2f(resLocDisp, canvas.width, canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}












async function main() {
    
    // Context grab
    const { canvas, gl } = await grab();
    console.log("Canvas and WebGL context grabbed:", canvas, gl);
    console.log("Max supported bound texture units:", gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS));

    // LBM buffers Setup
    const D2Q9_ping = await setupBuffers(canvas, gl);
    const D2Q9_pong = await setupBuffers(canvas, gl);
    console.log("D2Q9 setup:", D2Q9_ping, D2Q9_pong);

    // FBOs for ping-pong rendering
    const fbo_ping = createFBO(gl, D2Q9_ping);
    const fbo_pong = createFBO(gl, D2Q9_pong);
    console.log("FBOs created:", fbo_ping, fbo_pong);

    // Draw stuff on quad
    const quadBuffer = setupQuad(gl);
    console.log("Quad buffer created:", quadBuffer);

    // Fetch and compile shaders
    const programs = await shadersCompiler(gl, shaderConfig);
    console.log("Programs ready:", programs);




    // Single bind cuz everyone uses it
    for (let p in programs) {
        gl.useProgram(programs[p]);
        const posLoc = gl.getAttribLocation(programs[p], "a_position");
        gl.enableVertexAttribArray(posLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }

    const ping = { ...D2Q9_ping, fbo: fbo_ping };
    const pong = { ...D2Q9_pong, fbo: fbo_pong };

    const playPauseBtn = document.getElementById('play-pause-btn');
    const stepBtn = document.getElementById('step-btn');
    const stepRateInput = document.getElementById('step-rate-input');
    const simStatus = document.getElementById('sim-status');

    const simControl = {
        isPlaying: true,
        stepRequests: 0,
        maxStepsPerSecond: 60
    };

    function updateUiStatus() {
        if (playPauseBtn) playPauseBtn.textContent = simControl.isPlaying ? 'Pause' : 'Play';
        if (simStatus) simStatus.textContent = simControl.isPlaying ? 'Running' : 'Paused';
    }

    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            simControl.isPlaying = !simControl.isPlaying;
            updateUiStatus();
        });
    }

    if (stepBtn) {
        stepBtn.addEventListener('click', () => {
            simControl.stepRequests += 1;
        });
    }

    if (stepRateInput) {
        stepRateInput.addEventListener('change', () => {
            const parsed = Number(stepRateInput.value);
            const sanitized = Number.isFinite(parsed) ? Math.max(1, Math.min(2000, Math.floor(parsed))) : 120;
            simControl.maxStepsPerSecond = sanitized;
            stepRateInput.value = String(sanitized);
        });
    }

    updateUiStatus();

    // --- 3. INITIALIZE THE FLUID ---
    // Run the init shader ONCE to fill 'ping' with starting values
    gl.useProgram(programs.init);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ping.fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const densityBumpLoc = gl.getUniformLocation(programs.init, "densityBump");
    if (densityBumpLoc !== null) gl.uniform1f(densityBumpLoc, 1.6);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    let readState = ping;
    let writeState = pong;
    let lastTimeMs = 0;
    let stepBudget = 0;

    function frame(timeMs) {
        if (lastTimeMs === 0) lastTimeMs = timeMs;
        const dt = (timeMs - lastTimeMs) / 1000.0;
        lastTimeMs = timeMs;

        if (simControl.isPlaying) {
            stepBudget += dt * simControl.maxStepsPerSecond;
        }

        const maxStepsPerFrame = 20;
        let stepsThisFrame = 0;

        while ((stepBudget >= 1.0 || simControl.stepRequests > 0) && stepsThisFrame < maxStepsPerFrame) {
            if (simControl.stepRequests > 0) {
                simControl.stepRequests -= 1;
            } else {
                stepBudget -= 1.0;
            }

            runStep(gl, programs, readState, writeState, canvas);

            const temp = readState;
            readState = writeState;
            writeState = temp;
            stepsThisFrame += 1;
        }

        if (stepBudget > maxStepsPerFrame) {
            stepBudget = maxStepsPerFrame;
        }

        drawDisplay(gl, programs, readState, canvas);
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}







main();
