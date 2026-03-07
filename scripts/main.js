import { setupBuffers, createWallsTexture } from './inits.js';
import { createFBO, createWallInitFBO } from './fbo.js';
import { setupQuad } from './shader_helper.js';
import { shadersCompiler } from './shader_helper.js';


// Wall Objects Registry
const wallObjects = [
    {
        id: 'boundaryWalls',
        name: 'Boundary Walls',
        enabled: true,
        type: 'builtin' // Built into walls.frag
    },
    {
        id: 'fourCircles',
        name: 'Four Circles',
        enabled: false,
        type: 'static',
        instantiateShader: 'shaders/objects/fourCircles.frag'
    },
    {
        id: 'movingVerticalBar',
        name: 'Moving Vertical Bar',
        enabled: false,
        type: 'moving',
        instantiateShader: 'shaders/objects/movingVerticalBar.instantiate.frag',
        moveShader: 'shaders/objects/movingVerticalBar.move.frag'
    }
];

const shaderConfig = {
    vs: 'shaders/vert.glsl',
    init: 'shaders/init/inkDrop.frag',
    initUniform: 'shaders/init/uniform.frag',
    step: 'shaders/step.glsl',
    display: 'shaders/display.glsl',
    wallInit: 'shaders/init/walls.frag',
    wallsCopy: 'shaders/wallsCopy.frag'
};

const initializationModes = [
    {
        id: 'inkDrop',
        name: 'Ink Drop',
        programKey: 'init',
        params: [
            { key: 'inkDropX', label: 'Ink X', uniform: 'u_centerX', value: 0.85, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'inkDropY', label: 'Ink Y', uniform: 'u_centerY', value: 0.65, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'inkDropTopDensity', label: 'Top Density', uniform: 'u_topDensity', value: 1.6, step: 0.01, min: 1.0, max: 5.0 }
        ]
    },
    {
        id: 'uniform',
        name: 'Uniform',
        programKey: 'initUniform',
        params: [
            { key: 'uniformDensity', label: 'Density', uniform: 'u_uniformDensity', value: 1.0, step: 0.01, min: 0.1, max: 5.0 }
        ]
    }
];

// Add object shaders to config
wallObjects.forEach(obj => {
    if (obj.instantiateShader) {
        shaderConfig[`${obj.id}_instantiate`] = obj.instantiateShader;
    }
    if (obj.moveShader) {
        shaderConfig[`${obj.id}_move`] = obj.moveShader;
    }
});



async function grab() {
    const canvas = document.getElementById('lbm-canvas');
    const gl = canvas.getContext('webgl2');

    if (!gl) {
        console.error("WebGL2 not supported");
        return;
    }

    return { canvas, gl };
}





function bindLBMTextures(gl, program, textures, wallsTexture, prevWallsTexture) {
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

    // Bind shared walls to Unit 3
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, wallsTexture);
    gl.uniform1i(gl.getUniformLocation(program, "u_walls"), 3);

    if (prevWallsTexture) {
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, prevWallsTexture);
        const prevWallsLoc = gl.getUniformLocation(program, "u_prevWalls");
        if (prevWallsLoc !== null) gl.uniform1i(prevWallsLoc, 4);
    }
}



function runStep(gl, programs, readState, writeState, canvas, wallsTexture, prevWallsTexture) {
    // LBM Step
    gl.useProgram(programs.step);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeState.fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    bindLBMTextures(gl, programs.step, readState, wallsTexture, prevWallsTexture);
    
    // params
    const resLoc = gl.getUniformLocation(programs.step, "u_res");
    if (resLoc !== null) gl.uniform2f(resLoc, canvas.width, canvas.height);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawDisplay(gl, programs, stateToDisplay, canvas, wallsTexture, visualization) {
    gl.useProgram(programs.display);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    
    bindLBMTextures(gl, programs.display, stateToDisplay, wallsTexture, null);
    
    const resLocDisp = gl.getUniformLocation(programs.display, "u_res");
    if (resLocDisp !== null) gl.uniform2f(resLocDisp, canvas.width, canvas.height);

    const modeLoc = gl.getUniformLocation(programs.display, "u_visualizationMode");
    if (modeLoc !== null) gl.uniform1f(modeLoc, visualization.showVelocity ? 1.0 : 0.0);

    const densityRangeLoc = gl.getUniformLocation(programs.display, "u_densityRange");
    if (densityRangeLoc !== null) gl.uniform2f(densityRangeLoc, visualization.densityMin, visualization.densityMax);

    const velocityRangeLoc = gl.getUniformLocation(programs.display, "u_velocityRange");
    if (velocityRangeLoc !== null) gl.uniform2f(velocityRangeLoc, visualization.velocityMin, visualization.velocityMax);

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

    // Create shared walls texture (used by both ping and pong)
    const wallsTexture = createWallsTexture(canvas, gl);
    const prevWallsTexture = createWallsTexture(canvas, gl);
    const wallInitFBO = createWallInitFBO(gl, wallsTexture);
    const prevWallFBO = createWallInitFBO(gl, prevWallsTexture);

    // Single bind cuz everyone uses it
    const programsToSetup = ['init', 'initUniform', 'step', 'display', 'wallInit', 'wallsCopy'];
    // Add all object shader programs
    wallObjects.forEach(obj => {
        if (obj.instantiateShader) {
            programsToSetup.push(`${obj.id}_instantiate`);
        }
        if (obj.moveShader) {
            programsToSetup.push(`${obj.id}_move`);
        }
    });
    
    for (let p of programsToSetup) {
        if (programs[p]) {
            gl.useProgram(programs[p]);
            const posLoc = gl.getAttribLocation(programs[p], "a_position");
            gl.enableVertexAttribArray(posLoc);
            gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        }
    }

    const ping = { ...D2Q9_ping, fbo: fbo_ping };
    const pong = { ...D2Q9_pong, fbo: fbo_pong };

    // Generate UI for wall objects
    const wallObjectsContainer = document.getElementById('wall-objects-container');
    wallObjects.forEach(obj => {
        const row = document.createElement('div');
        row.className = 'row';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `obj-${obj.id}`;
        checkbox.checked = obj.enabled;
        
        const label = document.createElement('label');
        label.htmlFor = `obj-${obj.id}`;
        label.textContent = obj.name;
        
        row.appendChild(checkbox);
        row.appendChild(label);
        wallObjectsContainer.appendChild(row);
        
        // Update registry when checkbox changes
        checkbox.addEventListener('change', () => {
            obj.enabled = checkbox.checked;
        });
    });

    const playPauseBtn = document.getElementById('play-pause-btn');
    const stepBtn = document.getElementById('step-btn');
    const resetBtn = document.getElementById('reset-btn');
    const stepRateInput = document.getElementById('step-rate-input');
    const initTypeSelect = document.getElementById('init-type-select');
    const initParamsContainer = document.getElementById('init-params-container');
    const vizVelocityToggle = document.getElementById('viz-velocity-toggle');
    const densityMinSlider = document.getElementById('density-min-slider');
    const densityMaxSlider = document.getElementById('density-max-slider');
    const densityRangeFill = document.getElementById('density-range-fill');
    const densityRangeValue = document.getElementById('density-range-value');
    const velocityMinSlider = document.getElementById('velocity-min-slider');
    const velocityMaxSlider = document.getElementById('velocity-max-slider');
    const velocityRangeFill = document.getElementById('velocity-range-fill');
    const velocityRangeValue = document.getElementById('velocity-range-value');
    const simStatus = document.getElementById('sim-status');

    const simControl = {
        isPlaying: true,
        stepRequests: 0,
        maxStepsPerSecond: 60
    };

    const visualization = {
        showVelocity: false,
        densityMin: 1.0,
        densityMax: 1.6,
        velocityMin: 0.0,
        velocityMax: 0.2
    };

    const initialization = {
        selectedModeId: 'inkDrop',
        values: {}
    };

    initializationModes.forEach(mode => {
        mode.params.forEach(param => {
            initialization.values[param.key] = param.value;
        });
    });

    function clampValue(value, minValue, maxValue) {
        return Math.min(maxValue, Math.max(minValue, value));
    }

    function getSelectedInitializationMode() {
        return initializationModes.find(mode => mode.id === initialization.selectedModeId) || initializationModes[0];
    }

    function renderInitializationParams() {
        if (!initParamsContainer) return;
        initParamsContainer.innerHTML = '';

        const mode = getSelectedInitializationMode();
        mode.params.forEach(param => {
            const row = document.createElement('div');
            row.className = 'row';

            const label = document.createElement('label');
            label.htmlFor = `init-param-${param.key}`;
            label.textContent = param.label;

            const input = document.createElement('input');
            input.id = `init-param-${param.key}`;
            input.type = 'number';
            input.step = String(param.step);
            input.min = String(param.min);
            input.max = String(param.max);
            input.value = String(initialization.values[param.key]);

            input.addEventListener('change', () => {
                const parsed = Number(input.value);
                const fallback = initialization.values[param.key];
                const numeric = Number.isFinite(parsed) ? parsed : fallback;
                const clamped = clampValue(numeric, param.min, param.max);
                initialization.values[param.key] = clamped;
                input.value = String(clamped);
            });

            row.appendChild(label);
            row.appendChild(input);
            initParamsContainer.appendChild(row);
        });
    }

    function initializeInitializationUi() {
        if (!initTypeSelect) return;

        initTypeSelect.innerHTML = '';
        initializationModes.forEach(mode => {
            const option = document.createElement('option');
            option.value = mode.id;
            option.textContent = mode.name;
            initTypeSelect.appendChild(option);
        });

        initTypeSelect.value = initialization.selectedModeId;
        initTypeSelect.addEventListener('change', () => {
            initialization.selectedModeId = initTypeSelect.value;
            renderInitializationParams();
        });

        renderInitializationParams();
    }

    function setupDualSlider(minSlider, maxSlider, valueLabel, fillElement, onChange) {
        if (!minSlider || !maxSlider) return;

        const updateLabel = (minValue, maxValue) => {
            if (valueLabel) valueLabel.textContent = `${minValue.toFixed(3)} – ${maxValue.toFixed(3)}`;
        };

        const updateFromSliders = (movedMinSlider) => {
            let minValue = Number(minSlider.value);
            let maxValue = Number(maxSlider.value);

            if (minValue > maxValue) {
                if (movedMinSlider) {
                    maxValue = minValue;
                } else {
                    minValue = maxValue;
                }
            }

            minSlider.value = String(minValue);
            maxSlider.value = String(maxValue);
            updateLabel(minValue, maxValue);

            const sliderMin = Number(minSlider.min);
            const sliderMax = Number(minSlider.max);
            const span = Math.max(sliderMax - sliderMin, 1e-6);
            const minPct = ((minValue - sliderMin) / span) * 100.0;
            const maxPct = ((maxValue - sliderMin) / span) * 100.0;

            if (fillElement && fillElement.parentElement) {
                fillElement.parentElement.style.setProperty('--range-min', `${minPct}%`);
                fillElement.parentElement.style.setProperty('--range-max', `${maxPct}%`);
            }

            onChange(minValue, maxValue);
        };

        minSlider.addEventListener('input', () => updateFromSliders(true));
        maxSlider.addEventListener('input', () => updateFromSliders(false));

        updateFromSliders(true);
    }

    let readState = ping;
    let writeState = pong;
    let lastTimeMs = 0;
    let stepBudget = 0;
    let simulationIteration = 0;

    function applyInitializationUniforms(program, mode) {
        mode.params.forEach(param => {
            const loc = gl.getUniformLocation(program, param.uniform);
            if (loc !== null) {
                gl.uniform1f(loc, initialization.values[param.key]);
            }
        });
    }

    function initializeState(targetState) {
        const mode = getSelectedInitializationMode();
        const initProgram = programs[mode.programKey] || programs.init;

        gl.useProgram(initProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetState.fbo);
        gl.viewport(0, 0, canvas.width, canvas.height);
        applyInitializationUniforms(initProgram, mode);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function hasEnabledMovingObjects() {
        return wallObjects.some(obj => obj.enabled && obj.type === 'moving' && obj.moveShader);
    }

    function copyWallsToPrev() {
        gl.useProgram(programs.wallsCopy);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevWallFBO);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, wallsTexture);
        const wallsLoc = gl.getUniformLocation(programs.wallsCopy, 'u_walls');
        if (wallsLoc !== null) gl.uniform1i(wallsLoc, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function initializeWalls(iteration, useMoveForMovingObjects) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, wallInitFBO);
        gl.viewport(0, 0, canvas.width, canvas.height);
        
        // Clear wall texture first
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Enable additive blending so walls can composite
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        
        // Render each enabled wall object
        wallObjects.forEach(obj => {
            if (!obj.enabled) return;
            
            if (obj.type === 'builtin') {
                // Built-in walls (via wallInit shader)
                gl.useProgram(programs.wallInit);
                const resLoc = gl.getUniformLocation(programs.wallInit, "u_res");
                gl.uniform2f(resLoc, canvas.width, canvas.height);
                const boundaryWallsLoc = gl.getUniformLocation(programs.wallInit, "u_enableBoundaryWalls");
                gl.uniform1f(boundaryWallsLoc, 1.0);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            } else {
                let programKey = null;

                if (obj.type === 'moving' && useMoveForMovingObjects && obj.moveShader) {
                    programKey = `${obj.id}_move`;
                } else if (obj.instantiateShader) {
                    programKey = `${obj.id}_instantiate`;
                }

                if (!programKey || !programs[programKey]) return;

                gl.useProgram(programs[programKey]);
                const resLoc = gl.getUniformLocation(programs[programKey], "u_res");
                if (resLoc !== null) gl.uniform2f(resLoc, canvas.width, canvas.height);

                const iterLoc = gl.getUniformLocation(programs[programKey], "u_iteration");
                if (iterLoc !== null) gl.uniform1f(iterLoc, iteration);

                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        });
        
        // Disable blending
        gl.disable(gl.BLEND);
    }

    function resetSimulation() {
        simulationIteration = 0;
        initializeWalls(simulationIteration, false);
        copyWallsToPrev();
        initializeState(ping);
        initializeState(pong);

        readState = ping;
        writeState = pong;
        stepBudget = 0;
        simControl.stepRequests = 0;
        lastTimeMs = 0;

        drawDisplay(gl, programs, readState, canvas, wallsTexture, visualization);
    }

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

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            resetSimulation();
        });
    }

    if (stepRateInput) {
        stepRateInput.addEventListener('change', () => {
            const parsed = Number(stepRateInput.value);
            const sanitized = Number.isFinite(parsed) ? Math.max(1, Math.min(2000, Math.floor(parsed))) : 60;
            simControl.maxStepsPerSecond = sanitized;
            stepRateInput.value = String(sanitized);
        });
    }

    initializeInitializationUi();

    if (vizVelocityToggle) {
        vizVelocityToggle.addEventListener('change', () => {
            visualization.showVelocity = vizVelocityToggle.checked;
        });
    }

    setupDualSlider(densityMinSlider, densityMaxSlider, densityRangeValue, densityRangeFill, (minValue, maxValue) => {
        visualization.densityMin = minValue;
        visualization.densityMax = maxValue;
    });

    setupDualSlider(velocityMinSlider, velocityMaxSlider, velocityRangeValue, velocityRangeFill, (minValue, maxValue) => {
        visualization.velocityMin = minValue;
        visualization.velocityMax = maxValue;
    });

    updateUiStatus();

    // Init is equivalent to reset
    resetSimulation();

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

            simulationIteration += 1;
            if (hasEnabledMovingObjects()) {
                copyWallsToPrev();
                initializeWalls(simulationIteration, true);
            }

            runStep(gl, programs, readState, writeState, canvas, wallsTexture, prevWallsTexture);

            const temp = readState;
            readState = writeState;
            writeState = temp;
            stepsThisFrame += 1;
        }

        if (stepBudget > maxStepsPerFrame) {
            stepBudget = maxStepsPerFrame;
        }

        drawDisplay(gl, programs, readState, canvas, wallsTexture, visualization);
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}







main();
