import { setupBuffers, createWallsTexture } from './inits.js';
import { createFBO, createWallInitFBO } from './fbo.js';
import { setupQuad } from './shader_helper.js';
import { shadersCompiler } from './shader_helper.js';

// Settings Cache Manager
const SettingsCache = {
    STORAGE_KEY: 'lbm_settings',
    
    save(settings) {
        try {
            const data = {
                simControl: {
                    isPlaying: settings.simControl.isPlaying,
                    maxStepsPerSecond: settings.simControl.maxStepsPerSecond
                },
                boundaryMode: settings.boundaryMode.current,
                boundaryModeParamsValues: settings.boundaryModeParamsValues,
                simpleObject: settings.simpleObject,
                visualization: {
                    showVelocity: settings.visualization.showVelocity,
                    densityMin: settings.visualization.densityMin,
                    densityMax: settings.visualization.densityMax,
                    velocityMin: settings.visualization.velocityMin,
                    velocityMax: settings.visualization.velocityMax
                },
                initialization: {
                    selectedModeId: settings.initialization.selectedModeId,
                    values: settings.initialization.values
                },
                wallObjects: settings.wallObjects
                    .filter(obj => obj.id !== 'boundaryWalls')
                    .map(obj => ({
                        id: obj.id,
                        enabled: obj.enabled
                    }))
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save settings to cache:', e);
        }
    },
    
    load() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.warn('Failed to load settings from cache:', e);
            return null;
        }
    },
    
    clear() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {
            console.warn('Failed to clear settings cache:', e);
        }
    }
};


// Wall Objects Registry
const wallObjects = [
    {
        id: 'boundaryWalls',
        name: 'Boundary Walls',
        enabled: true,
        type: 'builtin', // Built into walls.frag
        hideFromUI: true // Controlled by boundary mode dropdown
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

// Simple Objects with Parameters
const simpleObjects = [
    {
        id: 'circle',
        name: 'Circle',
        shader: 'shaders/objects/circle.frag',
        params: [
            { key: 'centerX', label: 'X Position', uniform: 'u_centerX', value: 0.5, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'centerY', label: 'Y Position', uniform: 'u_centerY', value: 0.5, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'radius', label: 'Radius', uniform: 'u_radius', value: 0.15, step: 0.01, min: 0.01, max: 0.5 }
        ]
    },
    {
        id: 'rectangle',
        name: 'Rectangle',
        shader: 'shaders/objects/rectangle.frag',
        params: [
            { key: 'centerX', label: 'X Position', uniform: 'u_centerX', value: 0.5, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'centerY', label: 'Y Position', uniform: 'u_centerY', value: 0.5, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'width', label: 'Width', uniform: 'u_width', value: 0.3, step: 0.01, min: 0.01, max: 1.0 },
            { key: 'height', label: 'Height', uniform: 'u_height', value: 0.2, step: 0.01, min: 0.01, max: 1.0 },
            { key: 'rotation', label: 'Rotation (deg)', uniform: 'u_rotation', value: 0, step: 1, min: 0, max: 360, isAngle: true }
        ]
    },
    {
        id: 'triangle',
        name: 'Triangle',
        shader: 'shaders/objects/triangle.frag',
        params: [
            { key: 'centerX', label: 'X Position', uniform: 'u_centerX', value: 0.5, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'centerY', label: 'Y Position', uniform: 'u_centerY', value: 0.5, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'size', label: 'Size', uniform: 'u_size', value: 0.15, step: 0.01, min: 0.01, max: 0.5 },
            { key: 'rotation', label: 'Rotation (deg)', uniform: 'u_rotation', value: 0, step: 1, min: 0, max: 360, isAngle: true }
        ]
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

// Add simple object shaders to config
simpleObjects.forEach(obj => {
    shaderConfig[obj.id] = obj.shader;
});

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

// Boundary mode parameters
const boundaryModeParams = {
    airflowTunnel: [
        { key: 'tunnelVelocity', label: 'Tunnel Velocity', uniform: 'u_tunnelVelocity', value: -0.1, step: 0.01, min: -0.5, max: 0.0 }
    ],
    wrap: [],
    boundary: [],
    open: []
};

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



function runStep(gl, programs, readState, writeState, canvas, wallsTexture, prevWallsTexture, boundaryMode, boundaryModeParamsValues) {
    // LBM Step
    gl.useProgram(programs.step);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeState.fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    bindLBMTextures(gl, programs.step, readState, wallsTexture, prevWallsTexture);
    
    // params
    const resLoc = gl.getUniformLocation(programs.step, "u_res");
    if (resLoc !== null) gl.uniform2f(resLoc, canvas.width, canvas.height);
    
    // Pass boundary mode: 0 = wrap, 1 = boundary, 2 = open, 3 = airflowTunnel
    let boundaryModeValue = 0.0;
    if (boundaryMode.current === 'wrap') boundaryModeValue = 0.0;
    else if (boundaryMode.current === 'boundary') boundaryModeValue = 1.0;
    else if (boundaryMode.current === 'open') boundaryModeValue = 2.0;
    else if (boundaryMode.current === 'airflowTunnel') boundaryModeValue = 3.0;
    const boundaryModeLoc = gl.getUniformLocation(programs.step, "u_boundaryMode");
    if (boundaryModeLoc !== null) gl.uniform1f(boundaryModeLoc, boundaryModeValue);
    
    // Pass tunnel velocity parameter
    const tunnelVelLoc = gl.getUniformLocation(programs.step, "u_tunnelVelocity");
    if (tunnelVelLoc !== null) {
        const tunnelVel = boundaryModeParamsValues.airflowTunnel?.tunnelVelocity ?? -0.1;
        gl.uniform1f(tunnelVelLoc, tunnelVel);
    }
    
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

    // Generate UI for wall objects (excluding those hidden from UI)
    const wallObjectsContainer = document.getElementById('wall-objects-container');
    wallObjects.filter(obj => !obj.hideFromUI).forEach(obj => {
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
            SettingsCache.save(settings);
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
    const boundaryModeSelect = document.getElementById('boundary-mode-select');
    const simStatus = document.getElementById('sim-status');

    const simControl = {
        isPlaying: true,
        stepRequests: 0,
        maxStepsPerSecond: 60
    };

    const boundaryMode = {
        current: 'boundary' // 'wrap', 'boundary', 'open', or 'airflowTunnel'
    };

    const boundaryModeParamsValues = {
        airflowTunnel: {},
        wrap: {},
        boundary: {},
        open: {}
    };

    // Initialize boundary mode parameters
    Object.keys(boundaryModeParams).forEach(modeKey => {
        boundaryModeParams[modeKey].forEach(param => {
            boundaryModeParamsValues[modeKey][param.key] = param.value;
        });
    });

    const simpleObject = {
        selected: 'none', // 'none' or object id
        values: {}
    };

    // Initialize simple object parameters
    simpleObjects.forEach(obj => {
        simpleObject.values[obj.id] = {};
        obj.params.forEach(param => {
            simpleObject.values[obj.id][param.key] = param.value;
        });
    });

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

    // Settings object for caching
    const settings = {
        simControl,
        boundaryMode,
        boundaryModeParamsValues,
        simpleObject,
        visualization,
        initialization,
        wallObjects
    };

    // Load settings from cache
    const cachedSettings = SettingsCache.load();
    if (cachedSettings) {
        if (cachedSettings.simControl) {
            simControl.isPlaying = cachedSettings.simControl.isPlaying;
            simControl.maxStepsPerSecond = cachedSettings.simControl.maxStepsPerSecond;
        }
        if (cachedSettings.boundaryMode) {
            boundaryMode.current = cachedSettings.boundaryMode;
        }
        if (cachedSettings.boundaryModeParamsValues) {
            Object.assign(boundaryModeParamsValues, cachedSettings.boundaryModeParamsValues);
        }
        if (cachedSettings.simpleObject) {
            simpleObject.selected = cachedSettings.simpleObject.selected;
            Object.assign(simpleObject.values, cachedSettings.simpleObject.values);
        }
        if (cachedSettings.visualization) {
            visualization.showVelocity = cachedSettings.visualization.showVelocity;
            visualization.densityMin = cachedSettings.visualization.densityMin;
            visualization.densityMax = cachedSettings.visualization.densityMax;
            visualization.velocityMin = cachedSettings.visualization.velocityMin;
            visualization.velocityMax = cachedSettings.visualization.velocityMax;
        }
        if (cachedSettings.initialization) {
            initialization.selectedModeId = cachedSettings.initialization.selectedModeId;
            Object.assign(initialization.values, cachedSettings.initialization.values);
        }
        if (cachedSettings.wallObjects) {
            cachedSettings.wallObjects.forEach(cached => {
                const wallObj = wallObjects.find(obj => obj.id === cached.id);
                if (wallObj && !wallObj.hideFromUI) {
                    wallObj.enabled = cached.enabled;
                }
            });
        }
        
        // Sync boundary walls state based on loaded boundary mode
        const boundaryWallObj = wallObjects.find(obj => obj.id === 'boundaryWalls');
        if (boundaryWallObj) {
            boundaryWallObj.enabled = (boundaryMode.current === 'boundary' || boundaryMode.current === 'airflowTunnel');
        }
    }

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
                SettingsCache.save(settings);
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
            SettingsCache.save(settings);
        });

        renderInitializationParams();
    }

    function renderBoundaryModeParams() {
        const boundaryModeParamsContainer = document.getElementById('boundary-mode-params-container');
        if (!boundaryModeParamsContainer) return;
        boundaryModeParamsContainer.innerHTML = '';

        const params = boundaryModeParams[boundaryMode.current] || [];
        params.forEach(param => {
            const row = document.createElement('div');
            row.className = 'row';

            const label = document.createElement('label');
            label.htmlFor = `boundary-param-${param.key}`;
            label.textContent = param.label;

            const input = document.createElement('input');
            input.id = `boundary-param-${param.key}`;
            input.type = 'number';
            input.step = String(param.step);
            input.min = String(param.min);
            input.max = String(param.max);
            input.value = String(boundaryModeParamsValues[boundaryMode.current][param.key]);

            input.addEventListener('change', () => {
                const parsed = Number(input.value);
                const fallback = boundaryModeParamsValues[boundaryMode.current][param.key];
                const numeric = Number.isFinite(parsed) ? parsed : fallback;
                const clamped = clampValue(numeric, param.min, param.max);
                boundaryModeParamsValues[boundaryMode.current][param.key] = clamped;
                input.value = String(clamped);
                SettingsCache.save(settings);
            });

            row.appendChild(label);
            row.appendChild(input);
            boundaryModeParamsContainer.appendChild(row);
        });
    }

    function initializeSimpleObjectUi() {
        const simpleObjectSelect = document.getElementById('simple-object-select');
        if (!simpleObjectSelect) return;

        // Populate dropdown
        simpleObjectSelect.innerHTML = '<option value="none">None</option>';
        simpleObjects.forEach(obj => {
            const option = document.createElement('option');
            option.value = obj.id;
            option.textContent = obj.name;
            simpleObjectSelect.appendChild(option);
        });

        simpleObjectSelect.value = simpleObject.selected;
        simpleObjectSelect.addEventListener('change', () => {
            simpleObject.selected = simpleObjectSelect.value;
            renderSimpleObjectParams();
            resetSimulation();
            SettingsCache.save(settings);
        });

        renderSimpleObjectParams();
    }

    function renderSimpleObjectParams() {
        const simpleObjectParamsContainer = document.getElementById('simple-object-params-container');
        if (!simpleObjectParamsContainer) return;
        simpleObjectParamsContainer.innerHTML = '';

        if (simpleObject.selected === 'none') return;

        const obj = simpleObjects.find(o => o.id === simpleObject.selected);
        if (!obj) return;

        obj.params.forEach(param => {
            const row = document.createElement('div');
            row.className = 'row';

            const label = document.createElement('label');
            label.htmlFor = `simple-obj-param-${param.key}`;
            label.textContent = param.label;

            const input = document.createElement('input');
            input.id = `simple-obj-param-${param.key}`;
            input.type = 'number';
            input.step = String(param.step);
            input.min = String(param.min);
            input.max = String(param.max);
            input.value = String(simpleObject.values[simpleObject.selected][param.key]);

            input.addEventListener('change', () => {
                const parsed = Number(input.value);
                const fallback = simpleObject.values[simpleObject.selected][param.key];
                const numeric = Number.isFinite(parsed) ? parsed : fallback;
                const clamped = clampValue(numeric, param.min, param.max);
                simpleObject.values[simpleObject.selected][param.key] = clamped;
                input.value = String(clamped);
                resetSimulation();
                SettingsCache.save(settings);
            });

            row.appendChild(label);
            row.appendChild(input);
            simpleObjectParamsContainer.appendChild(row);
        });
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
                // Pass 1.0 for full walls, 2.0 for tunnel walls (top/bottom only)
                const wallMode = (boundaryMode.current === 'airflowTunnel') ? 2.0 : 1.0;
                gl.uniform1f(boundaryWallsLoc, wallMode);
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
        
        // Render simple object if selected
        if (simpleObject.selected !== 'none') {
            const obj = simpleObjects.find(o => o.id === simpleObject.selected);
            if (obj && programs[obj.id]) {
                gl.useProgram(programs[obj.id]);
                
                const resLoc = gl.getUniformLocation(programs[obj.id], "u_res");
                if (resLoc !== null) gl.uniform2f(resLoc, canvas.width, canvas.height);
                
                // Pass all parameters to the shader
                obj.params.forEach(param => {
                    const loc = gl.getUniformLocation(programs[obj.id], param.uniform);
                    if (loc !== null) {
                        let value = simpleObject.values[obj.id][param.key];
                        // Convert degrees to radians for angle parameters
                        if (param.isAngle) {
                            value = value * Math.PI / 180.0;
                        }
                        gl.uniform1f(loc, value);
                    }
                });
                
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }
        }
        
        // Disable blending
        gl.disable(gl.BLEND);
    }

    function updateTextureWrapping(textures, wrapMode) {
        // Update all LBM state textures
        [textures.Q1Q4, textures.Q5Q8, textures.Q9].forEach(tex => {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
        });
    }

    function setBoundaryMode(mode) {
        boundaryMode.current = mode;
        
        // Update texture wrapping based on mode
        const wrapMode = (mode === 'wrap') ? gl.REPEAT : gl.CLAMP_TO_EDGE;
        updateTextureWrapping(ping, wrapMode);
        updateTextureWrapping(pong, wrapMode);
        
        // Update boundary wall object enabled state
        const boundaryWallObj = wallObjects.find(obj => obj.id === 'boundaryWalls');
        if (boundaryWallObj) {
            boundaryWallObj.enabled = (mode === 'boundary' || mode === 'airflowTunnel');
            const checkbox = document.getElementById(`obj-${boundaryWallObj.id}`);
            if (checkbox) checkbox.checked = boundaryWallObj.enabled;
        }
        
        // Render boundary mode parameters UI
        renderBoundaryModeParams();
        
        // Reset simulation to apply changes
        resetSimulation();
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
        if (playPauseBtn) {
            playPauseBtn.textContent = simControl.isPlaying ? 'Pause' : 'Play';
            playPauseBtn.classList.remove('playing', 'paused');
            playPauseBtn.classList.add(simControl.isPlaying ? 'playing' : 'paused');
        }
        if (simStatus) simStatus.textContent = simControl.isPlaying ? 'Running' : 'Paused';
    }

    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            simControl.isPlaying = !simControl.isPlaying;
            updateUiStatus();
            SettingsCache.save(settings);
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
            SettingsCache.save(settings);
        });
    }

    initializeInitializationUi();
    initializeSimpleObjectUi();

    // Sync UI with cached settings
    function syncUiWithSettings() {
        // Sync step rate input
        if (stepRateInput) {
            stepRateInput.value = String(simControl.maxStepsPerSecond);
        }

        // Sync boundary mode
        if (boundaryModeSelect) {
            boundaryModeSelect.value = boundaryMode.current;
        }

        // Sync velocity toggle
        if (vizVelocityToggle) {
            vizVelocityToggle.checked = visualization.showVelocity;
        }

        // Sync density sliders
        if (densityMinSlider && densityMaxSlider) {
            densityMinSlider.value = String(visualization.densityMin);
            densityMaxSlider.value = String(visualization.densityMax);
        }

        // Sync velocity sliders
        if (velocityMinSlider && velocityMaxSlider) {
            velocityMinSlider.value = String(visualization.velocityMin);
            velocityMaxSlider.value = String(visualization.velocityMax);
        }

        // Sync wall object checkboxes
        wallObjects.filter(obj => !obj.hideFromUI).forEach(obj => {
            const checkbox = document.getElementById(`obj-${obj.id}`);
            if (checkbox) {
                checkbox.checked = obj.enabled;
            }
        });

        // Sync simple object select
        const simpleObjectSelect = document.getElementById('simple-object-select');
        if (simpleObjectSelect) {
            simpleObjectSelect.value = simpleObject.selected;
        }
    }

    syncUiWithSettings();

    if (vizVelocityToggle) {
        vizVelocityToggle.addEventListener('change', () => {
            visualization.showVelocity = vizVelocityToggle.checked;
            SettingsCache.save(settings);
        });
    }

    setupDualSlider(densityMinSlider, densityMaxSlider, densityRangeValue, densityRangeFill, (minValue, maxValue) => {
        visualization.densityMin = minValue;
        visualization.densityMax = maxValue;
        SettingsCache.save(settings);
    });

    setupDualSlider(velocityMinSlider, velocityMaxSlider, velocityRangeValue, velocityRangeFill, (minValue, maxValue) => {
        visualization.velocityMin = minValue;
        visualization.velocityMax = maxValue;
        SettingsCache.save(settings);
    });

    if (boundaryModeSelect) {
        boundaryModeSelect.addEventListener('change', () => {
            setBoundaryMode(boundaryModeSelect.value);
            SettingsCache.save(settings);
        });
        boundaryModeSelect.value = boundaryMode.current;
    }

    renderBoundaryModeParams();
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

            runStep(gl, programs, readState, writeState, canvas, wallsTexture, prevWallsTexture, boundaryMode, boundaryModeParamsValues);

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
