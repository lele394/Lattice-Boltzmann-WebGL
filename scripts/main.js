import { setupBuffers, createWallsTexture } from './inits.js';
import { createFBO, createWallInitFBO } from './fbo.js';
import { setupQuad } from './shader_helper.js';
import { shadersCompiler } from './shader_helper.js';
import { BITMAP_TEXTURE_UNIT, createCustomBitmapState, clearCustomBitmapState, loadCustomBitmapFromFile as loadCustomBitmapFromFileHelper, loadCustomBitmapFromDataUrl as loadCustomBitmapFromDataUrlHelper } from './bitmap.js';
import { SimulationRecorder } from './recorder.js';

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
                canvasDimensions: settings.canvasDimensions,
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
                customBitmapOptions: settings.customBitmapOptions,
                customBitmapCache: settings.customBitmapCache,
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
            { key: 'centerX', label: 'X Position', uniform: 'u_centerX', value: 0.85, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'centerY', label: 'Y Position', uniform: 'u_centerY', value: 0.5, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'size', label: 'Size', uniform: 'u_size', value: 0.44, step: 0.01, min: 0.01, max: 0.5 },
            { key: 'rotation', label: 'Rotation (deg)', uniform: 'u_rotation', value: 90, step: 1, min: 0, max: 360, isAngle: true }
        ]
    },
    {
        id: 'customBitmap',
        name: 'Custom Bitmap',
        shader: 'shaders/objects/customBitmap.frag',
        params: [
            { key: 'centerX', label: 'X Position', uniform: 'u_centerX', value: 0.5, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'centerY', label: 'Y Position', uniform: 'u_centerY', value: 0.5, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'scale', label: 'Scale', uniform: 'u_scale', value: 1.0, step: 0.01, min: 0.01, max: 4.0 },
            { key: 'rotation', label: 'Rotation (deg)', uniform: 'u_rotation', value: 0, step: 1, min: -360, max: 360, isAngle: true }
        ]
    }
];

const customBitmapState = createCustomBitmapState();

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
        { key: 'tunnelVelocity', label: 'Tunnel Velocity', uniform: 'u_tunnelVelocity', value: -0.2, step: 0.01, min: -0.5, max: 0.0 }
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
        gl.uniform1f(tunnelVelLoc, boundaryModeParamsValues.actualAirflow ?? 0.0);
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

    // Load cached dimensions BEFORE creating buffers
    const cachedSettings = SettingsCache.load();
    if (cachedSettings && cachedSettings.canvasDimensions) {
        canvas.width = cachedSettings.canvasDimensions.width;
        canvas.height = cachedSettings.canvasDimensions.height;
        console.log("Canvas dimensions loaded from cache:", canvas.width, canvas.height);
    }

    // LBM buffers Setup (now with correct dimensions)
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
    let wallsTexture = createWallsTexture(canvas, gl);
    let prevWallsTexture = createWallsTexture(canvas, gl);
    let wallInitFBO = createWallInitFBO(gl, wallsTexture);
    let prevWallFBO = createWallInitFBO(gl, prevWallsTexture);

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
    const resetSettingsBtn = document.getElementById('reset-settings-btn');
    const stepRateInput = document.getElementById('step-rate-input');
    const stepRateSlider = document.getElementById('step-rate-slider');
    const initTypeSelect = document.getElementById('init-type-select');
    const initParamsContainer = document.getElementById('init-params-container');
    const vizDensityBtn = document.getElementById('viz-density-btn');
    const vizVelocityBtn = document.getElementById('viz-velocity-btn');
    const densityRangeBlock = document.getElementById('density-range-block');
    const velocityRangeBlock = document.getElementById('velocity-range-block');
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
    const canvasWidthInput = document.getElementById('canvas-width-input');
    const canvasHeightInput = document.getElementById('canvas-height-input');
    const collapseBtn = document.getElementById('collapse-btn');
    const simControls = document.getElementById('sim-controls');
    const controlsHeader = document.getElementById('controls-header');
    const controlsGithubLink = document.getElementById('controls-github-link');
    const recordToggleBtn = document.getElementById('record-toggle-btn');
    const recordDownloadBtn = document.getElementById('record-download-btn');
    const recordIntervalInput = document.getElementById('record-interval-input');
    const recordingStatus = document.getElementById('recording-status');

    const canvasDimensions = {
        width: canvas.width,
        height: canvas.height
    };

    const simControl = {
        isPlaying: true,
        stepRequests: 0,
        maxStepsPerSecond: 600
    };

    // Initialize recorder
    const recorder = new SimulationRecorder(canvas);
    let recordedBlob = null;

    recorder.onFrameCountUpdate = (frameCount) => {
        if (recordingStatus) {
            recordingStatus.textContent = `Recording: ${frameCount} frame${frameCount !== 1 ? 's' : ''}`;
            recordingStatus.style.color = '#ff6b6b';
        }
    };

    recorder.onRecordingComplete = (blob, format) => {
        recordedBlob = blob;
        if (recordingStatus) {
            recordingStatus.textContent = `Ready to download (${recorder.recordedFrameCount} frames)`;
            recordingStatus.style.color = '#51cf66';
        }
        if (recordDownloadBtn) {
            recordDownloadBtn.disabled = false;
        }
        console.log(`Recording complete: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    };

    const boundaryMode = {
        current: 'airflowTunnel' // 'wrap', 'boundary', 'open', or 'airflowTunnel'
    };

    const boundaryModeParamsValues = {
        airflowTunnel: {},
        wrap: {},
        boundary: {},
        open: {}
    };

    // Track actual airflow velocity (separate from target setting)
    // This gradually changes towards the target to prevent instability
    let actualAirflowVelocity = 0.0;
    const AIRFLOW_RAMP_RATE = 0.00005; // 

    // Initialize boundary mode parameters
    Object.keys(boundaryModeParams).forEach(modeKey => {
        boundaryModeParams[modeKey].forEach(param => {
            boundaryModeParamsValues[modeKey][param.key] = param.value;
        });
    });

    const simpleObject = {
        selected: 'triangle', // 'none' or object id
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
        showVelocity: true,
        densityMin: 1.0,
        densityMax: 1.6,
        velocityMin: 0.0,
        velocityMax: 0.3
    };

    const customBitmapOptions = {
        flipX: false,
        flipY: false,
        invertMask: false
    };

    const customBitmapCache = {
        dataUrl: null,
        fileName: ''
    };

    const initialization = {
        selectedModeId: 'uniform',
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
        customBitmapOptions,
        customBitmapCache,
        canvasDimensions,
        visualization,
        initialization,
        wallObjects
    };

    // Load remaining settings from cache (dimensions already loaded earlier)
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
        if (cachedSettings.customBitmapOptions) {
            Object.assign(customBitmapOptions, cachedSettings.customBitmapOptions);
        }
        if (cachedSettings.customBitmapCache) {
            Object.assign(customBitmapCache, cachedSettings.customBitmapCache);
        }
        if (cachedSettings.canvasDimensions) {
            // Dimensions already applied to canvas, just update the object
            canvasDimensions.width = cachedSettings.canvasDimensions.width;
            canvasDimensions.height = cachedSettings.canvasDimensions.height;
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

    async function loadCustomBitmapFromFile(file) {
        if (!file) return;

        await loadCustomBitmapFromFileHelper(gl, customBitmapState, file);
        customBitmapCache.dataUrl = customBitmapState.sourceDataUrl;
        customBitmapCache.fileName = customBitmapState.fileName;
        simpleObject.selected = 'customBitmap';
        const simpleObjectSelect = document.getElementById('simple-object-select');
        if (simpleObjectSelect) simpleObjectSelect.value = 'customBitmap';
        renderSimpleObjectParams();
        resetSimulation();
        SettingsCache.save(settings);
    }

    async function restoreCustomBitmapFromCache() {
        if (!customBitmapCache.dataUrl) return;

        try {
            await loadCustomBitmapFromDataUrlHelper(
                gl,
                customBitmapState,
                customBitmapCache.dataUrl,
                customBitmapCache.fileName || 'Cached Bitmap'
            );
        } catch (error) {
            console.warn('Failed to restore cached custom bitmap:', error);
            clearCustomBitmapState(gl, customBitmapState);
            customBitmapCache.dataUrl = null;
            customBitmapCache.fileName = '';
            SettingsCache.save(settings);
        }
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
            const sliderBlock = document.createElement('div');
            sliderBlock.className = 'slider-block';
            sliderBlock.style.marginTop = '10px';

            const sliderHeader = document.createElement('div');
            sliderHeader.className = 'slider-header';

            const label = document.createElement('label');
            label.htmlFor = `boundary-param-${param.key}-slider`;
            label.textContent = param.label;

            const numberInput = document.createElement('input');
            numberInput.id = `boundary-param-${param.key}-input`;
            numberInput.type = 'number';
            numberInput.step = String(param.step);
            numberInput.min = String(param.min);
            numberInput.max = String(param.max);
            numberInput.value = String(boundaryModeParamsValues[boundaryMode.current][param.key]);
            numberInput.style.width = '70px';
            numberInput.style.textAlign = 'center';

            const slider = document.createElement('input');
            slider.id = `boundary-param-${param.key}-slider`;
            slider.type = 'range';
            slider.step = String(param.step);
            slider.min = String(param.min);
            slider.max = String(param.max);
            slider.value = String(boundaryModeParamsValues[boundaryMode.current][param.key]);
            slider.style.width = '100%';

            const velocityDisplay = document.createElement('div');
            velocityDisplay.id = `boundary-param-${param.key}-display`;
            velocityDisplay.style.fontSize = '11px';
            velocityDisplay.style.marginTop = '4px';
            velocityDisplay.style.display = 'flex';
            velocityDisplay.style.justifyContent = 'space-between';
            velocityDisplay.innerHTML = `
                <span>Target: <span id="boundary-param-${param.key}-target">0.00</span></span>
                <span style="color: #888;">Actual: <span id="boundary-param-${param.key}-actual">0.00</span></span>
            `;

            const updateValue = (value) => {
                const parsed = Number(value);
                const fallback = boundaryModeParamsValues[boundaryMode.current][param.key];
                const numeric = Number.isFinite(parsed) ? parsed : fallback;
                const clamped = clampValue(numeric, param.min, param.max);
                boundaryModeParamsValues[boundaryMode.current][param.key] = clamped;
                numberInput.value = String(clamped.toFixed(2));
                slider.value = String(clamped);
                updateVelocityDisplay();
                SettingsCache.save(settings);
            };

            numberInput.addEventListener('change', () => {
                updateValue(numberInput.value);
            });

            numberInput.addEventListener('input', () => {
                const parsed = Number(numberInput.value);
                if (Number.isFinite(parsed)) {
                    const clamped = clampValue(parsed, param.min, param.max);
                    slider.value = String(clamped);
                }
            });

            slider.addEventListener('input', () => {
                const value = Number(slider.value);
                boundaryModeParamsValues[boundaryMode.current][param.key] = value;
                numberInput.value = String(value.toFixed(2));
                updateVelocityDisplay();
                SettingsCache.save(settings);
            });

            sliderHeader.appendChild(label);
            sliderHeader.appendChild(numberInput);
            sliderBlock.appendChild(sliderHeader);
            sliderBlock.appendChild(slider);
            sliderBlock.appendChild(velocityDisplay);
            boundaryModeParamsContainer.appendChild(sliderBlock);

            // Initial display update
            updateVelocityDisplay();
        });
    }

    function updateVelocityDisplay() {
        if (boundaryMode.current === 'airflowTunnel') {
            const targetVelocity = boundaryModeParamsValues.airflowTunnel?.tunnelVelocity ?? 0.0;
            const targetElem = document.getElementById('boundary-param-tunnelVelocity-target');
            const actualElem = document.getElementById('boundary-param-tunnelVelocity-actual');
            
            if (targetElem) {
                targetElem.textContent = targetVelocity.toFixed(3);
            }
            if (actualElem) {
                actualElem.textContent = actualAirflowVelocity.toFixed(3);
            }
        }
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

        if (obj.id === 'customBitmap') {
            const uploadRow = document.createElement('div');
            uploadRow.className = 'row';

            const uploadLabel = document.createElement('label');
            uploadLabel.textContent = 'Bitmap';

            const uploadInput = document.createElement('input');
            uploadInput.type = 'file';
            uploadInput.accept = 'image/*';
            uploadInput.style.width = '170px';

            uploadInput.addEventListener('change', async () => {
                const file = uploadInput.files && uploadInput.files[0];
                if (!file) return;
                try {
                    await loadCustomBitmapFromFile(file);
                } catch (error) {
                    console.error('Failed to load custom bitmap:', error);
                    alert('Failed to load custom bitmap image.');
                }
            });

            uploadRow.appendChild(uploadLabel);
            uploadRow.appendChild(uploadInput);
            simpleObjectParamsContainer.appendChild(uploadRow);

            const bitmapInfoRow = document.createElement('div');
            bitmapInfoRow.className = 'row';
            bitmapInfoRow.style.fontSize = '11px';
            bitmapInfoRow.style.color = '#9aa0b8';

            const infoLabel = document.createElement('span');
            if (customBitmapState.loaded) {
                infoLabel.textContent = `${customBitmapState.fileName || 'Loaded image'} (${customBitmapState.width}x${customBitmapState.height})`;
            } else {
                infoLabel.textContent = 'No bitmap loaded';
            }
            bitmapInfoRow.appendChild(infoLabel);
            simpleObjectParamsContainer.appendChild(bitmapInfoRow);

            const clearRow = document.createElement('div');
            clearRow.className = 'button-group';
            clearRow.style.marginBottom = '8px';

            const clearButton = document.createElement('button');
            clearButton.type = 'button';
            clearButton.textContent = 'Clear Bitmap';
            clearButton.addEventListener('click', () => {
                clearCustomBitmapState(gl, customBitmapState);
                customBitmapCache.dataUrl = null;
                customBitmapCache.fileName = '';
                renderSimpleObjectParams();
                resetSimulation();
                SettingsCache.save(settings);
            });

            clearRow.appendChild(clearButton);
            simpleObjectParamsContainer.appendChild(clearRow);

            const optionsTitle = document.createElement('div');
            optionsTitle.textContent = 'Bitmap Options';
            optionsTitle.style.fontSize = '11px';
            optionsTitle.style.fontWeight = '600';
            optionsTitle.style.letterSpacing = '0.6px';
            optionsTitle.style.textTransform = 'uppercase';
            optionsTitle.style.color = '#9aa0b8';
            optionsTitle.style.marginTop = '10px';
            optionsTitle.style.marginBottom = '8px';
            simpleObjectParamsContainer.appendChild(optionsTitle);

            const optionsRow = document.createElement('div');
            optionsRow.style.display = 'grid';
            optionsRow.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
            optionsRow.style.gap = '6px';
            optionsRow.style.marginBottom = '8px';

            const makeToggleButton = (label, key) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = label;
                button.style.fontSize = '11px';
                button.style.padding = '6px 8px';
                button.style.borderRadius = '8px';
                button.style.border = '1px solid #4a4f62';
                button.style.cursor = 'pointer';

                const applyStyle = () => {
                    const enabled = customBitmapOptions[key];
                    button.style.background = enabled
                        ? 'linear-gradient(135deg, #305da8 0%, #203f75 100%)'
                        : 'linear-gradient(135deg, #2b2f40 0%, #1f2230 100%)';
                    button.style.borderColor = enabled ? '#5f8edc' : '#4a4f62';
                    button.style.color = enabled ? '#ffffff' : '#d2d8ea';
                };

                button.addEventListener('click', () => {
                    customBitmapOptions[key] = !customBitmapOptions[key];
                    applyStyle();
                    resetSimulation();
                    SettingsCache.save(settings);
                });

                applyStyle();
                return button;
            };

            optionsRow.appendChild(makeToggleButton('Horizontal Flip', 'flipX'));
            optionsRow.appendChild(makeToggleButton('Vertical Flip', 'flipY'));
            optionsRow.appendChild(makeToggleButton('Invert Mask', 'invertMask'));
            simpleObjectParamsContainer.appendChild(optionsRow);
        }

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
                let shouldDrawSimpleObject = true;
                
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

                if (obj.id === 'customBitmap') {
                    if (!customBitmapState.loaded || !customBitmapState.texture) {
                        shouldDrawSimpleObject = false;
                    }

                    if (shouldDrawSimpleObject) {
                        const sizeLoc = gl.getUniformLocation(programs[obj.id], 'u_bitmapSize');
                        if (sizeLoc !== null) {
                            gl.uniform2f(sizeLoc, customBitmapState.width, customBitmapState.height);
                        }

                        const maskLoc = gl.getUniformLocation(programs[obj.id], 'u_bitmapMask');
                        if (maskLoc !== null) {
                            gl.activeTexture(gl.TEXTURE0 + BITMAP_TEXTURE_UNIT);
                            gl.bindTexture(gl.TEXTURE_2D, customBitmapState.texture);
                            gl.uniform1i(maskLoc, BITMAP_TEXTURE_UNIT);
                        }

                        const flipXLoc = gl.getUniformLocation(programs[obj.id], 'u_flipX');
                        if (flipXLoc !== null) {
                            gl.uniform1f(flipXLoc, customBitmapOptions.flipX ? 1.0 : 0.0);
                        }

                        const flipYLoc = gl.getUniformLocation(programs[obj.id], 'u_flipY');
                        if (flipYLoc !== null) {
                            gl.uniform1f(flipYLoc, customBitmapOptions.flipY ? 1.0 : 0.0);
                        }

                        const invertLoc = gl.getUniformLocation(programs[obj.id], 'u_invertMask');
                        if (invertLoc !== null) {
                            gl.uniform1f(invertLoc, customBitmapOptions.invertMask ? 1.0 : 0.0);
                        }
                    }
                }
                
                if (shouldDrawSimpleObject) {
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                }
            }
        }
        
        // Disable blending
        gl.disable(gl.BLEND);
    }

    function updateTextureWrapping(textures, wrapMode) {
        // Save current texture unit
        const currentTexUnit = gl.getParameter(gl.ACTIVE_TEXTURE);
        
        // Update all LBM state textures
        gl.activeTexture(gl.TEXTURE0);
        [textures.Q1Q4, textures.Q5Q8, textures.Q9].forEach(tex => {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapMode);
        });
        
        // Unbind and restore
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(currentTexUnit);
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
        
        // Reset actual airflow velocity
        actualAirflowVelocity = 0.0;
        updateVelocityDisplay();

        drawDisplay(gl, programs, readState, canvas, wallsTexture, visualization);
    }

    function updateUiStatus() {
        if (playPauseBtn) {
            playPauseBtn.textContent = simControl.isPlaying ? 'Pause' : 'Play';
            playPauseBtn.classList.remove('playing', 'paused');
            playPauseBtn.classList.add(simControl.isPlaying ? 'playing' : 'paused');
        }
        if (simStatus) {
            simStatus.textContent = simControl.isPlaying ? 'Running' : 'Paused';
            simStatus.classList.remove('running', 'paused');
            simStatus.classList.add(simControl.isPlaying ? 'running' : 'paused');
        }
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

    if (resetSettingsBtn) {
        resetSettingsBtn.addEventListener('click', () => {
            if (confirm('Reset all settings to defaults? This will reload the page.')) {
                SettingsCache.clear();
                location.reload();
            }
        });
    }

    // Recording controls
    if (recordToggleBtn) {
        recordToggleBtn.addEventListener('click', async () => {
            if (!recorder.isRecording) {
                // Start recording
                const format = 'webm';
                const interval = Number(recordIntervalInput?.value) || 1;
                
                if (!SimulationRecorder.isSupported()) {
                    alert('Recording is not supported in this browser.');
                    return;
                }
                
                recordedBlob = null;
                if (recordDownloadBtn) recordDownloadBtn.disabled = true;
                
                await recorder.startRecording(format, interval);
                
                recordToggleBtn.textContent = 'Stop Recording';
                recordToggleBtn.style.background = '#c92a2a';
                if (recordingStatus) {
                    recordingStatus.textContent = 'Recording: 0 frames';
                    recordingStatus.style.color = '#ff6b6b';
                }
            } else {
                // Stop recording
                await recorder.stopRecording();
                
                recordToggleBtn.textContent = 'Start Recording';
                recordToggleBtn.style.background = '';
            }
        });
    }

    if (recordDownloadBtn) {
        recordDownloadBtn.addEventListener('click', () => {
            if (recordedBlob) {
                const format = 'webm';
                recorder.downloadRecording(recordedBlob, format);
                
                if (recordingStatus) {
                    recordingStatus.textContent = 'Download started';
                    recordingStatus.style.color = '#888';
                }
            }
        });
    }

    // Collapse/Expand functionality
    if (collapseBtn && controlsHeader && simControls) {
        const toggleCollapse = () => {
            simControls.classList.toggle('collapsed');
            const isCollapsed = simControls.classList.contains('collapsed');
            localStorage.setItem('lbm_controls_collapsed', isCollapsed ? 'true' : 'false');
        };

        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCollapse();
        });

        controlsHeader.addEventListener('click', () => {
            if (simControls.classList.contains('collapsed')) {
                toggleCollapse();
            }
        });

        // Restore collapsed state from localStorage
        const wasCollapsed = localStorage.getItem('lbm_controls_collapsed') === 'true';
        if (wasCollapsed) {
            simControls.classList.add('collapsed');
        }
    }

    if (controlsGithubLink) {
        controlsGithubLink.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    if (stepRateInput) {
        const updateStepRate = (value) => {
            const parsed = Number(value);
            const sanitized = Number.isFinite(parsed) ? Math.max(0, Math.min(1000, Math.floor(parsed))) : 60;
            simControl.maxStepsPerSecond = sanitized;
            stepRateInput.value = String(sanitized);
            if (stepRateSlider) stepRateSlider.value = String(sanitized);
            SettingsCache.save(settings);
        };

        stepRateInput.addEventListener('change', () => {
            updateStepRate(stepRateInput.value);
        });

        stepRateInput.addEventListener('input', () => {
            const parsed = Number(stepRateInput.value);
            if (Number.isFinite(parsed)) {
                const sanitized = Math.max(0, Math.min(1000, parsed));
                if (stepRateSlider) stepRateSlider.value = String(sanitized);
            }
        });
    }

    if (stepRateSlider) {
        stepRateSlider.addEventListener('input', () => {
            const value = Number(stepRateSlider.value);
            simControl.maxStepsPerSecond = value;
            if (stepRateInput) stepRateInput.value = String(value);
            SettingsCache.save(settings);
        });
    }

    await restoreCustomBitmapFromCache();

    initializeInitializationUi();
    initializeSimpleObjectUi();

    // Function to update visualization mode UI
    function updateVisualizationMode() {
        if (visualization.showVelocity) {
            if (vizVelocityBtn) vizVelocityBtn.classList.add('active');
            if (vizDensityBtn) vizDensityBtn.classList.remove('active');
            if (velocityRangeBlock) velocityRangeBlock.style.display = 'block';
            if (densityRangeBlock) densityRangeBlock.style.display = 'none';
        } else {
            if (vizDensityBtn) vizDensityBtn.classList.add('active');
            if (vizVelocityBtn) vizVelocityBtn.classList.remove('active');
            if (densityRangeBlock) densityRangeBlock.style.display = 'block';
            if (velocityRangeBlock) velocityRangeBlock.style.display = 'none';
        }
    }

    // Sync UI with cached settings
    function syncUiWithSettings() {
        // Sync step rate input and slider
        if (stepRateInput) {
            stepRateInput.value = String(simControl.maxStepsPerSecond);
        }
        if (stepRateSlider) {
            stepRateSlider.value = String(simControl.maxStepsPerSecond);
        }

        // Sync boundary mode
        if (boundaryModeSelect) {
            boundaryModeSelect.value = boundaryMode.current;
        }

        // Sync velocity toggle
        updateVisualizationMode();

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

        // Sync canvas dimension inputs
        if (canvasWidthInput) {
            canvasWidthInput.value = String(canvasDimensions.width);
        }
        if (canvasHeightInput) {
            canvasHeightInput.value = String(canvasDimensions.height);
        }
    }

    syncUiWithSettings();

    if (vizDensityBtn) {
        vizDensityBtn.addEventListener('click', () => {
            visualization.showVelocity = false;
            updateVisualizationMode();
            SettingsCache.save(settings);
        });
    }

    if (vizVelocityBtn) {
        vizVelocityBtn.addEventListener('click', () => {
            visualization.showVelocity = true;
            updateVisualizationMode();
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

    // Canvas dimension change handlers with debouncing
    let resizeTimeout = null;
    const handleCanvasDimensionChange = () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(async () => {
            const width = Number(canvasWidthInput?.value) || 600;
            const height = Number(canvasHeightInput?.value) || 600;
            const clampedWidth = clampValue(width, 100, 2000);
            const clampedHeight = clampValue(height, 100, 2000);
            
            canvasDimensions.width = clampedWidth;
            canvasDimensions.height = clampedHeight;
            
            if (canvasWidthInput) canvasWidthInput.value = String(clampedWidth);
            if (canvasHeightInput) canvasHeightInput.value = String(clampedHeight);
            
            // Resize canvas
            canvas.width = clampedWidth;
            canvas.height = clampedHeight;
            
            console.log('Resizing canvas to:', canvas.width, 'x', canvas.height);
            
            // Update WebGL viewport immediately
            gl.viewport(0, 0, canvas.width, canvas.height);
            
            // Unbind everything first to avoid state issues
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.bindTexture(gl.TEXTURE_2D, null);
            
            // Delete old textures
            if (ping.Q1Q4) gl.deleteTexture(ping.Q1Q4);
            if (ping.Q5Q8) gl.deleteTexture(ping.Q5Q8);
            if (ping.Q9) gl.deleteTexture(ping.Q9);
            if (pong.Q1Q4) gl.deleteTexture(pong.Q1Q4);
            if (pong.Q5Q8) gl.deleteTexture(pong.Q5Q8);
            if (pong.Q9) gl.deleteTexture(pong.Q9);
            if (wallsTexture) gl.deleteTexture(wallsTexture);
            if (prevWallsTexture) gl.deleteTexture(prevWallsTexture);
            
            // Delete old framebuffers
            if (ping.fbo) gl.deleteFramebuffer(ping.fbo);
            if (pong.fbo) gl.deleteFramebuffer(pong.fbo);
            if (wallInitFBO) gl.deleteFramebuffer(wallInitFBO);
            if (prevWallFBO) gl.deleteFramebuffer(prevWallFBO);
            
            // Flush to ensure deletions complete
            gl.flush();
            gl.finish();
            
            // Recreate buffers with proper wrap mode (await the async function!)
            const wrapMode = (boundaryMode.current === 'wrap') ? gl.REPEAT : gl.CLAMP_TO_EDGE;
            
            const newPing = await setupBuffers(canvas, gl, wrapMode);
            const newPong = await setupBuffers(canvas, gl, wrapMode);
            
            Object.assign(ping, {
                Q1Q4: newPing.Q1Q4,
                Q5Q8: newPing.Q5Q8,
                Q9: newPing.Q9,
                fbo: createFBO(gl, newPing)
            });
            
            Object.assign(pong, {
                Q1Q4: newPong.Q1Q4,
                Q5Q8: newPong.Q5Q8,
                Q9: newPong.Q9,
                fbo: createFBO(gl, newPong)
            });
            
            // Recreate walls textures and FBOs with matching wrap mode
            wallsTexture = createWallsTexture(canvas, gl, wrapMode);
            prevWallsTexture = createWallsTexture(canvas, gl, wrapMode);
            wallInitFBO = createWallInitFBO(gl, wallsTexture);
            prevWallFBO = createWallInitFBO(gl, prevWallsTexture);
            
            // Verify FBO completeness
            gl.bindFramebuffer(gl.FRAMEBUFFER, ping.fbo);
            let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.error('Ping FBO incomplete after resize:', status.toString(16));
            }
            
            gl.bindFramebuffer(gl.FRAMEBUFFER, pong.fbo);
            status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.error('Pong FBO incomplete after resize:', status.toString(16));
            }
            
            gl.bindFramebuffer(gl.FRAMEBUFFER, wallInitFBO);
            status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.error('Wall init FBO incomplete after resize:', status.toString(16));
            }
            
            gl.bindFramebuffer(gl.FRAMEBUFFER, prevWallFBO);
            status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                console.error('Prev wall FBO incomplete after resize:', status.toString(16));
            }
            
            // Unbind framebuffer to avoid state issues
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            
            // Unbind all texture units to clean state
            for (let i = 0; i < 5; i++) {
                gl.activeTexture(gl.TEXTURE0 + i);
                gl.bindTexture(gl.TEXTURE_2D, null);
            }
            
            console.log('Canvas resized to:', clampedWidth, 'x', clampedHeight);
            
            resetSimulation();
            SettingsCache.save(settings);
        }, 500);
    };

    if (canvasWidthInput) {
        canvasWidthInput.addEventListener('change', handleCanvasDimensionChange);
    }
    if (canvasHeightInput) {
        canvasHeightInput.addEventListener('change', handleCanvasDimensionChange);
    }

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

            // Gradually adjust actual airflow velocity towards target
            if (boundaryMode.current === 'airflowTunnel') {
                const targetVelocity = boundaryModeParamsValues.airflowTunnel?.tunnelVelocity ?? 0.0;
                const diff = targetVelocity - actualAirflowVelocity;
                if (Math.abs(diff) < AIRFLOW_RAMP_RATE) {
                    actualAirflowVelocity = targetVelocity;
                } else {
                    actualAirflowVelocity += Math.sign(diff) * AIRFLOW_RAMP_RATE;
                }
            } else {
                // Reset to zero when not in airflow tunnel mode
                actualAirflowVelocity = 0.0;
            }
            boundaryModeParamsValues.actualAirflow = actualAirflowVelocity;

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
        
        // Capture frame for recording if active and simulation is playing
        if (recorder.isRecording && simControl.isPlaying && stepsThisFrame > 0) {
            recorder.captureFrame();
        }
        
        updateVelocityDisplay();
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}







main();
