import { setupBuffers, createWallsTexture } from './inits.js';
import { createFBO, createWallInitFBO } from './fbo.js';
import { setupQuad } from './shader_helper.js';
import { shadersCompiler } from './shader_helper.js';
import { BITMAP_TEXTURE_UNIT, createCustomBitmapState, clearCustomBitmapState, loadCustomBitmapFromFile as loadCustomBitmapFromFileHelper, loadCustomBitmapFromDataUrl as loadCustomBitmapFromDataUrlHelper } from './bitmap.js';
import { SimulationRecorder } from './recorder.js';

// ============================================================================
// SIMULATION CONFIGURATION PARAMETERS
// ============================================================================
const CONFIG = {
    // Simulation Physics
    AIRFLOW_RAMP_RATE: 0.002,          // Maximum velocity change per step for airflow ramp-up
    MAX_STEPS_PER_FRAME: 20,              // Maximum simulation steps to execute per render frame
    
    // Canvas Dimensions
    CANVAS_WIDTH_MIN: 100,                // Minimum canvas width in pixels
    CANVAS_WIDTH_MAX: 2000,               // Maximum canvas width in pixels
    CANVAS_HEIGHT_MIN: 100,               // Minimum canvas height in pixels
    CANVAS_HEIGHT_MAX: 2000,              // Maximum canvas height in pixels
    CANVAS_RESIZE_DEBOUNCE_MS: 500,       // Debounce delay for canvas resize in milliseconds
    
    // Step Rate Control
    STEP_RATE_MIN: 0,                     // Minimum steps per second
    STEP_RATE_MAX: 1000,                  // Maximum steps per second
    
    // D2Q9 Lattice Visualization
    D2Q9_LATTICE_SCALE: 80,               // Distance from center to edge points
    D2Q9_ARROW_SIZE: 16,                  // Size of arrow heads
    D2Q9_CENTER_DOT_RADIUS: 8,            // Radius of center dot
    D2Q9_GRID_LINE_WIDTH: 2,              // Width of grid lines
    D2Q9_DIRECTION_LINE_WIDTH: 4,         // Width of direction lines
    D2Q9_VALUE_FONT_SIZE: 22,             // Font size for distribution values (px)
    D2Q9_LABEL_FONT_SIZE: 18,             // Font size for index labels (px)
    D2Q9_TEXT_PADDING: 6,                 // Padding around text backgrounds
    D2Q9_LABEL_OFFSET: 24,                // Vertical offset for index labels
    D2Q9_CENTER_LABEL_OFFSET: -36,        // Vertical offset for center label
    D2Q9_TEXT_POSITION_SCALE: 1.3,        // Position multiplier for text placement
    
    // D2Q9 Visualization Colors
    D2Q9_COLORS: {
        background: 'rgba(10, 10, 15, 0.5)',
        gridLines: 'rgba(100, 100, 120, 0.3)',
        directionLines: 'rgba(159, 179, 255, 0.5)',
        centerDot: '#51cf66',
        centerText: '#51cf66',
        directionText: '#9fb3ff',
        labelText: '#888',
        textBackground: 'rgba(20, 20, 24, 0.9)'
    },
    
    // Hover Info Display
    HOVER_INFO_OFFSET_X: 15,              // Horizontal offset from cursor (px)
    HOVER_INFO_OFFSET_Y: 15,              // Vertical offset from cursor (px)
    HOVER_INFO_DECIMAL_PLACES: 4,         // Decimal places for hover info values
    
    // UI Formatting
    RANGE_SLIDER_DECIMAL_PLACES: 3,       // Decimal places for range slider displays
    UI_FONT_SIZE_SMALL: 11,               // Small font size for UI elements (px)
    
    // WebGL Texture Units
    MAX_TEXTURE_UNITS: 5                  // Number of texture units to unbind during cleanup
};

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
                    velocityMax: settings.visualization.velocityMax,
                    showHoverInfo: settings.visualization.showHoverInfo,
                    autoCalibrateEachFrame: settings.visualization.autoCalibrateEachFrame,
                    powerStretch: settings.visualization.powerStretch
                },
                mrtRelaxation: {
                    values: settings.mrtRelaxation.values
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
    },
    {
        id: 'aerospike',
        name: 'Aerospike Nozzle',
        shader: 'shaders/objects/aerospike.frag',
        params: [
            { key: 'centerX', label: 'X Position', uniform: 'u_centerX', value: 0.25, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'centerY', label: 'Y Position', uniform: 'u_centerY', value: 0.5, step: 0.01, min: 0.0, max: 1.0 },
            { key: 'throatRadius', label: 'Throat Radius', uniform: 'u_throatRadius', value: 0.08, step: 0.005, min: 0.02, max: 0.2 },
            { key: 'spikeLength', label: 'Spike Length', uniform: 'u_spikeLength', value: 0.35, step: 0.01, min: 0.1, max: 0.6 },
            { key: 'convergingLength', label: 'Converging Length', uniform: 'u_convergingLength', value: 0.15, step: 0.01, min: 0.05, max: 0.4 },
            { key: 'inletRadius', label: 'Inlet Radius', uniform: 'u_inletRadius', value: 0.15, step: 0.005, min: 0.05, max: 0.3 },
            { key: 'wallThickness', label: 'Wall Thickness', uniform: 'u_wallThickness', value: 0.02, step: 0.005, min: 0.005, max: 0.1 },
            { key: 'truncationRatio', label: 'Truncation Ratio', uniform: 'u_truncationRatio', value: 0.2, step: 0.05, min: 0.0, max: 0.8 }
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
            { key: 'inkDropTopDensity', label: 'Top Density', uniform: 'u_topDensity', value: 1.6, step: 0.01, min: 1.0, max: 5.0 },
            { key: 'tau', label: 'Tau', uniform: 'u_tau', value: 0.6, step: 0.01, min: 0.51, max: 2.0 }
        ]
    },
    {
        id: 'uniform',
        name: 'Uniform',
        programKey: 'initUniform',
        params: [
            { key: 'uniformDensity', label: 'Density', uniform: 'u_uniformDensity', value: 1.0, step: 0.01, min: 0.1, max: 5.0 },
            { key: 'tau', label: 'Tau', uniform: 'u_tau', value: 0.6, step: 0.01, min: 0.51, max: 2.0 }
        ]
    }
];

// Boundary mode parameters
const boundaryModeParams = {
    airflowTunnel: [
        { key: 'tunnelVelocity', label: 'Tunnel Velocity', uniform: 'u_tunnelVelocity', value: -0.2, step: 0.01, min: -0.5, max: 0.0 },
        { key: 'rampRate', label: 'Ramp Rate (/10000 step)', uniform: null, value: 2.0, step: 0.1, min: 0.1, max: 29.0, logarithmic: true }
    ],
    wrap: [],
    boundary: [],
    open: []
};

// MRT Relaxation Spectrum Parameters
const mrtRelaxationParams = [
    { key: 's1', label: 's1 (Energy)', uniform: 'u_s1', value: 1.6, step: 0.001, min: 0.5, max: 2.0 },
    { key: 's2', label: 's2 (Energy²)', uniform: 'u_s2', value: 1.6, step: 0.001, min: 0.5, max: 2.0 },
    { key: 's4', label: 's4 (Energy flux)', uniform: 'u_s4', value: 1.6, step: 0.001, min: 0.5, max: 2.0 },
    { key: 's6', label: 's6 (Energy flux)', uniform: 'u_s6', value: 1.6, step: 0.001, min: 0.5, max: 2.0 },
    { key: 's7', label: 's7 (Stress, tau)', uniform: 'u_s7', value: -1.0, step: 0.001, min: -1.0, max: 2.0, useTau: true },
    { key: 's8', label: 's8 (Stress, tau)', uniform: 'u_s8', value: -1.0, step: 0.001, min: -1.0, max: 2.0, useTau: true }
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



function runStep(gl, programs, readState, writeState, canvas, wallsTexture, prevWallsTexture, boundaryMode, boundaryModeParamsValues, initialization, mrtRelaxation) {
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

    const tauLoc = gl.getUniformLocation(programs.step, "u_tau");
    if (tauLoc !== null) {
        gl.uniform1f(tauLoc, initialization.values.tau ?? 0.6);
    }

    // Pass MRT relaxation parameters
    mrtRelaxationParams.forEach(param => {
        const loc = gl.getUniformLocation(programs.step, param.uniform);
        if (loc !== null) {
            let value = mrtRelaxation.values[param.key];
            // s7 and s8 are computed as 1.0/tau
            if (param.useTau) {
                const tau = initialization.values.tau ?? 0.6;
                value = 1.0 / tau;
            }
            gl.uniform1f(loc, value);
        }
    });
    
    // Pass tunnel velocity parameter
    const tunnelVelLoc = gl.getUniformLocation(programs.step, "u_tunnelVelocity");
    if (tunnelVelLoc !== null) {
        const targetAirflow = boundaryModeParamsValues.airflowTunnel?.tunnelVelocity ?? 0.0;
        const actualAirflow = boundaryModeParamsValues.actualAirflow;
        const airflow = (boundaryMode.current === 'airflowTunnel')
            ? (Number.isFinite(actualAirflow) ? actualAirflow : targetAirflow)
            : 0.0;
        gl.uniform1f(tunnelVelLoc, airflow);
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

    const powerStretchLoc = gl.getUniformLocation(programs.display, "u_powerStretch");
    if (powerStretchLoc !== null) gl.uniform1f(powerStretchLoc, visualization.powerStretch);

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
    const mrtParamsContainer = document.getElementById('mrt-params-container');
    const vizDensityBtn = document.getElementById('viz-density-btn');
    const vizVelocityBtn = document.getElementById('viz-velocity-btn');
    const autoCalibrateBtn = document.getElementById('auto-calibrate-btn');
    const autoCalibrateLiveToggle = document.getElementById('auto-calibrate-live-toggle');
    const zoneOfInterestBtn = document.getElementById('zone-of-interest-btn');
    const zoneOfInterestBox = document.getElementById('zone-of-interest-box');
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
    const powerStretchSlider = document.getElementById('power-stretch-slider');
    const powerStretchValue = document.getElementById('power-stretch-value');
    const powerStretchInput = document.getElementById('power-stretch-input');
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
    const hoverInfoToggle = document.getElementById('hover-info-toggle');
    const hoverInfoDiv = document.getElementById('hover-info');
    const hoverInfoContent = document.getElementById('hover-info-content');
    const d2q9Canvas = document.getElementById('d2q9-canvas');
    const d2q9Ctx = d2q9Canvas ? d2q9Canvas.getContext('2d') : null;

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
    let actualAirflowVelocity = 0.0;

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
        velocityMax: 0.3,
        showHoverInfo: true,
        autoCalibrateEachFrame: false,
        powerStretch: 1.0
    };

    const zoneOfInterest = {
        isSelecting: false,
        dragStart: null,
        bounds: null
    };

    const mrtRelaxation = {
        values: {}
    };

    // Initialize MRT relaxation parameters
    mrtRelaxationParams.forEach(param => {
        mrtRelaxation.values[param.key] = param.value;
    });

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
        mrtRelaxation,
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
            if (cachedSettings.visualization.showHoverInfo !== undefined) {
                visualization.showHoverInfo = cachedSettings.visualization.showHoverInfo;
            }
            if (cachedSettings.visualization.autoCalibrateEachFrame !== undefined) {
                visualization.autoCalibrateEachFrame = cachedSettings.visualization.autoCalibrateEachFrame;
            }
            if (cachedSettings.visualization.powerStretch !== undefined) {
                const parsedPowerStretch = Number(cachedSettings.visualization.powerStretch);
                visualization.powerStretch = clampValue(parsedPowerStretch, 0.01, 10.0);
            }
        }
        if (cachedSettings.mrtRelaxation) {
            Object.assign(mrtRelaxation.values, cachedSettings.mrtRelaxation.values);
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

    function renderMrtParams() {
        if (!mrtParamsContainer) return;
        mrtParamsContainer.innerHTML = '';

        mrtRelaxationParams.forEach(param => {
            const row = document.createElement('div');
            row.className = 'row';

            const label = document.createElement('label');
            label.htmlFor = `mrt-param-${param.key}`;
            label.textContent = param.label;
            label.title = param.useTau ? 'Computed as 1.0/tau during simulation' : '';

            const input = document.createElement('input');
            input.id = `mrt-param-${param.key}`;
            input.type = 'number';
            input.step = String(param.step);
            input.min = String(param.min);
            input.max = String(param.max);
            input.value = String(mrtRelaxation.values[param.key]);
            
            if (param.useTau) {
                input.disabled = true;
                input.style.opacity = '0.6';
                input.title = 'Auto-computed from tau';
            }

            input.addEventListener('change', () => {
                if (param.useTau) return;
                const parsed = Number(input.value);
                const fallback = mrtRelaxation.values[param.key];
                const numeric = Number.isFinite(parsed) ? parsed : fallback;
                const clamped = clampValue(numeric, param.min, param.max);
                mrtRelaxation.values[param.key] = clamped;
                input.value = String(clamped);
                SettingsCache.save(settings);
            });

            row.appendChild(label);
            row.appendChild(input);
            mrtParamsContainer.appendChild(row);
        });
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
            
            // Setup slider range (logarithmic if specified)
            if (param.logarithmic) {
                slider.step = '0.001';
                slider.min = String(Math.log10(param.min));
                slider.max = String(Math.log10(param.max));
                slider.value = String(Math.log10(boundaryModeParamsValues[boundaryMode.current][param.key]));
            } else {
                slider.step = String(param.step);
                slider.min = String(param.min);
                slider.max = String(param.max);
                slider.value = String(boundaryModeParamsValues[boundaryMode.current][param.key]);
            }
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
                
                if (param.logarithmic) {
                    slider.value = String(Math.log10(clamped));
                } else {
                    slider.value = String(clamped);
                }
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
                    if (param.logarithmic) {
                        slider.value = String(Math.log10(clamped));
                    } else {
                        slider.value = String(clamped);
                    }
                }
            });

            slider.addEventListener('input', () => {
                let value;
                if (param.logarithmic) {
                    value = Math.pow(10, Number(slider.value));
                } else {
                    value = Number(slider.value);
                }
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
            if (valueLabel) valueLabel.textContent = `${minValue.toFixed(CONFIG.RANGE_SLIDER_DECIMAL_PLACES)} – ${maxValue.toFixed(CONFIG.RANGE_SLIDER_DECIMAL_PLACES)}`;
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

    function applyAutoCalibratedSliderRange(minSlider, maxSlider, valueMin, valueMax) {
        if (!minSlider || !maxSlider) return;
        if (!Number.isFinite(valueMin) || !Number.isFinite(valueMax)) return;

        const lower = Math.min(valueMin, valueMax);
        const upper = Math.max(valueMin, valueMax);
        const sliderMin = Number(minSlider.min);
        const sliderMax = Number(minSlider.max);
        const clampedLower = Math.min(Math.max(lower, sliderMin), sliderMax);
        const clampedUpper = Math.min(Math.max(upper, sliderMin), sliderMax);

        minSlider.value = String(Math.min(clampedLower, clampedUpper));
        maxSlider.value = String(Math.max(clampedLower, clampedUpper));

        minSlider.dispatchEvent(new Event('input', { bubbles: true }));
        maxSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function getCanvasPointFromMouseEvent(e) {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
        const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
        return {
            x: Math.max(0, Math.min(canvas.width - 1, x)),
            y: Math.max(0, Math.min(canvas.height - 1, y))
        };
    }

    function buildBoundsFromCorners(a, b) {
        return {
            xMin: Math.min(a.x, b.x),
            xMax: Math.max(a.x, b.x),
            yMin: Math.min(a.y, b.y),
            yMax: Math.max(a.y, b.y)
        };
    }

    function renderZoneOfInterestOverlay(bounds) {
        if (!zoneOfInterestBox || !bounds) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;

        zoneOfInterestBox.style.left = `${rect.left + bounds.xMin * scaleX}px`;
        zoneOfInterestBox.style.top = `${rect.top + bounds.yMin * scaleY}px`;
        zoneOfInterestBox.style.width = `${Math.max(1, (bounds.xMax - bounds.xMin + 1) * scaleX)}px`;
        zoneOfInterestBox.style.height = `${Math.max(1, (bounds.yMax - bounds.yMin + 1) * scaleY)}px`;
        zoneOfInterestBox.style.display = 'block';
    }

    function updateZoneOfInterestUi() {
        if (zoneOfInterestBtn) {
            zoneOfInterestBtn.classList.toggle('active', zoneOfInterest.isSelecting);
        }

        if (zoneOfInterest.bounds) {
            renderZoneOfInterestOverlay(zoneOfInterest.bounds);
        } else if (zoneOfInterestBox) {
            zoneOfInterestBox.style.display = 'none';
        }
    }

    function updatePowerStretchUi() {
        if (powerStretchSlider) {
            powerStretchSlider.value = String(visualization.powerStretch);
        }
        if (powerStretchValue) {
            powerStretchValue.textContent = visualization.powerStretch.toFixed(CONFIG.RANGE_SLIDER_DECIMAL_PLACES);
        }
        if (powerStretchInput) {
            powerStretchInput.value = visualization.powerStretch.toFixed(CONFIG.RANGE_SLIDER_DECIMAL_PLACES);
        }
    }

    function autoCalibrateVisualizationRange() {
        if (!readState || !readState.fbo) return false;

        const width = canvas.width;
        const height = canvas.height;
        const pixelCount = width * height;
        if (pixelCount <= 0) return false;

        const q1q4Data = new Float32Array(pixelCount * 4);
        const q5q8Data = new Float32Array(pixelCount * 4);
        const q9Data = new Float32Array(pixelCount);
        const wallData = new Float32Array(pixelCount * 4);

        const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const prevReadBuffer = gl.getParameter(gl.READ_BUFFER);

        try {
            gl.bindFramebuffer(gl.FRAMEBUFFER, readState.fbo);

            gl.readBuffer(gl.COLOR_ATTACHMENT0);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, q1q4Data);

            gl.readBuffer(gl.COLOR_ATTACHMENT1);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, q5q8Data);

            gl.readBuffer(gl.COLOR_ATTACHMENT2);
            gl.readPixels(0, 0, width, height, gl.RED, gl.FLOAT, q9Data);

            gl.bindFramebuffer(gl.FRAMEBUFFER, wallInitFBO);
            gl.readBuffer(gl.COLOR_ATTACHMENT0);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, wallData);
        } catch (error) {
            console.warn('Auto calibration failed to read framebuffer data:', error);
            return false;
        } finally {
            gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
            if (prevReadBuffer !== null) {
                gl.readBuffer(prevReadBuffer);
            }
        }

        let minValue = Infinity;
        let maxValue = -Infinity;

        const bounds = zoneOfInterest.bounds || {
            xMin: 0,
            xMax: width - 1,
            yMin: 0,
            yMax: height - 1
        };

        for (let canvasY = bounds.yMin; canvasY <= bounds.yMax; canvasY++) {
            const glY = height - 1 - canvasY;
            for (let canvasX = bounds.xMin; canvasX <= bounds.xMax; canvasX++) {
                const index = glY * width + canvasX;

                const wall = wallData[index * 4];
                if (wall > 0.5) continue;

                const q1q4Offset = index * 4;
                const q5q8Offset = index * 4;

                const f0 = q9Data[index];
                const f1 = q1q4Data[q1q4Offset + 0];
                const f2 = q1q4Data[q1q4Offset + 1];
                const f3 = q1q4Data[q1q4Offset + 2];
                const f4 = q1q4Data[q1q4Offset + 3];
                const f5 = q5q8Data[q5q8Offset + 0];
                const f6 = q5q8Data[q5q8Offset + 1];
                const f7 = q5q8Data[q5q8Offset + 2];
                const f8 = q5q8Data[q5q8Offset + 3];

                const rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
                if (!Number.isFinite(rho) || rho <= 0.0) continue;

                const ux = (f1 - f3 + f5 - f6 - f7 + f8) / rho;
                const uy = (f2 - f4 + f5 + f6 - f7 - f8) / rho;
                const speed = Math.hypot(ux, uy);

                const exploded = !Number.isFinite(speed) || speed > 2.0;
                if (exploded) continue;

                const value = visualization.showVelocity ? speed : rho;
                if (!Number.isFinite(value)) continue;

                if (value < minValue) minValue = value;
                if (value > maxValue) maxValue = value;
            }
        }

        if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
            return false;
        }

        if (visualization.showVelocity) {
            applyAutoCalibratedSliderRange(velocityMinSlider, velocityMaxSlider, minValue, maxValue);
        } else {
            applyAutoCalibratedSliderRange(densityMinSlider, densityMaxSlider, minValue, maxValue);
        }

        SettingsCache.save(settings);
        return true;
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
        
        // Reset actual airflow velocity to 0 (will ramp up to target)
        actualAirflowVelocity = 0.0;
        boundaryModeParamsValues.actualAirflow = actualAirflowVelocity;
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

    // Drag functionality for controls panel
    if (controlsHeader && simControls) {
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let panelStartX = 0;
        let panelStartY = 0;

        // Restore position from localStorage
        const savedLeft = localStorage.getItem('lbm_controls_left');
        const savedTop = localStorage.getItem('lbm_controls_top');
        if (savedLeft !== null && savedTop !== null) {
            simControls.style.left = savedLeft;
            simControls.style.top = savedTop;
            simControls.style.right = 'auto';
        }

        controlsHeader.addEventListener('mousedown', (e) => {
            // Ignore if clicking on buttons or links
            if (e.target.closest('#collapse-btn') || e.target.closest('#controls-github-link')) {
                return;
            }

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = simControls.getBoundingClientRect();
            panelStartX = rect.left;
            panelStartY = rect.top;

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            let newLeft = panelStartX + deltaX;
            let newTop = panelStartY + deltaY;

            // Constrain to viewport
            const rect = simControls.getBoundingClientRect();
            const maxLeft = window.innerWidth - rect.width;
            const maxTop = window.innerHeight - rect.height;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            simControls.style.left = newLeft + 'px';
            simControls.style.top = newTop + 'px';
            simControls.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                // Save position to localStorage
                localStorage.setItem('lbm_controls_left', simControls.style.left);
                localStorage.setItem('lbm_controls_top', simControls.style.top);
            }
        });
    }

    if (controlsGithubLink) {
        controlsGithubLink.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    if (stepRateInput) {
        const updateStepRate = (value) => {
            const parsed = Number(value);
            const sanitized = Number.isFinite(parsed) ? Math.max(CONFIG.STEP_RATE_MIN, Math.min(CONFIG.STEP_RATE_MAX, Math.floor(parsed))) : 60;
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
                const sanitized = Math.max(CONFIG.STEP_RATE_MIN, Math.min(CONFIG.STEP_RATE_MAX, parsed));
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
    renderMrtParams();
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

        if (autoCalibrateLiveToggle) {
            autoCalibrateLiveToggle.checked = visualization.autoCalibrateEachFrame;
        }

        updatePowerStretchUi();

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

    if (autoCalibrateBtn) {
        autoCalibrateBtn.addEventListener('click', () => {
            const didCalibrate = autoCalibrateVisualizationRange();
            if (!didCalibrate) {
                console.warn('Auto calibration did not find valid values in current frame.');
            }
        });
    }

    if (autoCalibrateLiveToggle) {
        autoCalibrateLiveToggle.checked = visualization.autoCalibrateEachFrame;
        autoCalibrateLiveToggle.addEventListener('change', () => {
            visualization.autoCalibrateEachFrame = autoCalibrateLiveToggle.checked;
            SettingsCache.save(settings);
        });
    }

    if (powerStretchSlider) {
        updatePowerStretchUi();
        powerStretchSlider.addEventListener('input', () => {
            const parsed = Number(powerStretchSlider.value);
            visualization.powerStretch = clampValue(parsed, 0.01, 10.0);
            updatePowerStretchUi();
            SettingsCache.save(settings);
        });
    }

    if (powerStretchInput) {
        powerStretchInput.addEventListener('change', () => {
            const parsed = Number(powerStretchInput.value);
            const fallback = visualization.powerStretch;
            const numeric = Number.isFinite(parsed) ? parsed : fallback;
            visualization.powerStretch = clampValue(numeric, 0.01, 10.0);
            updatePowerStretchUi();
            SettingsCache.save(settings);
        });

        powerStretchInput.addEventListener('input', () => {
            const parsed = Number(powerStretchInput.value);
            if (!Number.isFinite(parsed)) return;
            const clamped = clampValue(parsed, 0.01, 10.0);
            if (powerStretchSlider) {
                powerStretchSlider.value = String(clamped);
            }
            if (powerStretchValue) {
                powerStretchValue.textContent = clamped.toFixed(CONFIG.RANGE_SLIDER_DECIMAL_PLACES);
            }
        });
    }

    if (zoneOfInterestBtn && canvas) {
        zoneOfInterestBtn.addEventListener('click', () => {
            zoneOfInterest.isSelecting = !zoneOfInterest.isSelecting;
            if (zoneOfInterest.isSelecting) {
                zoneOfInterest.dragStart = null;
            }
            updateZoneOfInterestUi();
        });

        canvas.addEventListener('mousedown', (e) => {
            if (!zoneOfInterest.isSelecting) return;
            zoneOfInterest.dragStart = getCanvasPointFromMouseEvent(e);
            zoneOfInterest.bounds = buildBoundsFromCorners(zoneOfInterest.dragStart, zoneOfInterest.dragStart);
            updateZoneOfInterestUi();
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!zoneOfInterest.isSelecting || !zoneOfInterest.dragStart) return;
            const current = getCanvasPointFromMouseEvent(e);
            zoneOfInterest.bounds = buildBoundsFromCorners(zoneOfInterest.dragStart, current);
            updateZoneOfInterestUi();
        });

        window.addEventListener('mouseup', (e) => {
            if (!zoneOfInterest.isSelecting || !zoneOfInterest.dragStart) return;
            const current = getCanvasPointFromMouseEvent(e);
            zoneOfInterest.bounds = buildBoundsFromCorners(zoneOfInterest.dragStart, current);
            zoneOfInterest.dragStart = null;
            zoneOfInterest.isSelecting = false;
            updateZoneOfInterestUi();
        });

        window.addEventListener('resize', () => {
            updateZoneOfInterestUi();
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

    // Hover info toggle
    if (hoverInfoToggle) {
        hoverInfoToggle.checked = visualization.showHoverInfo;
        hoverInfoToggle.addEventListener('change', () => {
            visualization.showHoverInfo = hoverInfoToggle.checked;
            if (!visualization.showHoverInfo && hoverInfoDiv) {
                hoverInfoDiv.style.display = 'none';
            }
            SettingsCache.save(settings);
        });
    }

    // Mouse hover info functionality with live updates
    let currentMousePos = null;
    let lastMouseEvent = null;

    if (canvas && hoverInfoDiv && hoverInfoContent) {
        canvas.addEventListener('mousemove', (e) => {
            if (!visualization.showHoverInfo) return;

            lastMouseEvent = e;
            const rect = canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
            const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
            
            currentMousePos = { x, y, clientX: e.clientX, clientY: e.clientY };
        });

        canvas.addEventListener('mouseenter', (e) => {
            if (!visualization.showHoverInfo) return;
            lastMouseEvent = e;
        });

        canvas.addEventListener('mouseleave', () => {
            currentMousePos = null;
            lastMouseEvent = null;
            if (hoverInfoDiv) {
                hoverInfoDiv.style.display = 'none';
            }
        });
    }

    // Function to draw D2Q9 lattice visualization
    function drawD2Q9Lattice(ctx, f) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const scale = CONFIG.D2Q9_LATTICE_SCALE;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = CONFIG.D2Q9_COLORS.background;
        ctx.fillRect(0, 0, width, height);

        // D2Q9 directions: [dx, dy]
        const directions = [
            [0, 0],      // f0: center
            [1, 0],      // f1: right
            [0, -1],     // f2: top (negative Y because canvas Y is down)
            [-1, 0],     // f3: left
            [0, 1],      // f4: bottom
            [1, -1],     // f5: top-right
            [-1, -1],    // f6: top-left
            [-1, 1],     // f7: bottom-left
            [1, 1]       // f8: bottom-right
        ];

        // Draw grid lines
        ctx.strokeStyle = CONFIG.D2Q9_COLORS.gridLines;
        ctx.lineWidth = CONFIG.D2Q9_GRID_LINE_WIDTH;
        ctx.beginPath();
        // Vertical and horizontal
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, height);
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        // Diagonals
        ctx.moveTo(0, 0);
        ctx.lineTo(width, height);
        ctx.moveTo(width, 0);
        ctx.lineTo(0, height);
        ctx.stroke();

        // Draw directions and values
        directions.forEach((dir, i) => {
            const [dx, dy] = dir;
            const endX = centerX + dx * scale;
            const endY = centerY + dy * scale;

            // Draw direction line
            if (i > 0) { // Skip center for line drawing
                ctx.strokeStyle = CONFIG.D2Q9_COLORS.directionLines;
                ctx.lineWidth = CONFIG.D2Q9_DIRECTION_LINE_WIDTH;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(endX, endY);
                ctx.stroke();

                // Draw arrow head
                const angle = Math.atan2(dy, dx);
                const arrowSize = CONFIG.D2Q9_ARROW_SIZE;
                ctx.beginPath();
                ctx.moveTo(endX, endY);
                ctx.lineTo(
                    endX - arrowSize * Math.cos(angle - Math.PI / 6),
                    endY - arrowSize * Math.sin(angle - Math.PI / 6)
                );
                ctx.lineTo(
                    endX - arrowSize * Math.cos(angle + Math.PI / 6),
                    endY - arrowSize * Math.sin(angle + Math.PI / 6)
                );
                ctx.closePath();
                ctx.fillStyle = CONFIG.D2Q9_COLORS.directionLines;
                ctx.fill();
            }

            // Draw value text
            const value = f[i].toFixed(CONFIG.RANGE_SLIDER_DECIMAL_PLACES);
            const textX = centerX + dx * scale * (i === 0 ? 0 : CONFIG.D2Q9_TEXT_POSITION_SCALE);
            const textY = centerY + dy * scale * (i === 0 ? 0 : CONFIG.D2Q9_TEXT_POSITION_SCALE) + (i === 0 ? CONFIG.D2Q9_CENTER_LABEL_OFFSET : 0);

            // Background for text
            ctx.font = `${CONFIG.D2Q9_VALUE_FONT_SIZE}px "Courier New", monospace`;
            const metrics = ctx.measureText(value);
            const padding = CONFIG.D2Q9_TEXT_PADDING;
            ctx.fillStyle = CONFIG.D2Q9_COLORS.textBackground;
            ctx.fillRect(
                textX - metrics.width / 2 - padding,
                textY - 12 - padding,
                metrics.width + padding * 2,
                24 + padding * 2
            );

            // Draw text
            ctx.fillStyle = i === 0 ? CONFIG.D2Q9_COLORS.centerText : CONFIG.D2Q9_COLORS.directionText;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(value, textX, textY);

            // Draw index label (above for top directions, below for others)
            const isTopDirection = [2, 5, 6].includes(i);
            ctx.font = `${CONFIG.D2Q9_LABEL_FONT_SIZE}px "Courier New", monospace`;
            ctx.fillStyle = CONFIG.D2Q9_COLORS.labelText;
            ctx.fillText(`f${i}`, textX, textY + (isTopDirection ? -CONFIG.D2Q9_LABEL_OFFSET : CONFIG.D2Q9_LABEL_OFFSET));
        });

        // Draw center dot
        ctx.beginPath();
        ctx.arc(centerX, centerY, CONFIG.D2Q9_CENTER_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = CONFIG.D2Q9_COLORS.centerDot;
        ctx.fill();
    }

    // Function to update hover info (called every frame)
    function updateHoverInfo() {
        if (!visualization.showHoverInfo || !currentMousePos || !hoverInfoDiv || !hoverInfoContent) {
            return;
        }

        const { x, y, clientX, clientY } = currentMousePos;

        // Read pixel data from all three textures (Q1Q4, Q5Q8, Q9)
        gl.bindFramebuffer(gl.FRAMEBUFFER, readState.fbo);
        
        // Read from COLOR_ATTACHMENT0 (Q1Q4: f0, f1, f2, f3)
        const q1q4Data = new Float32Array(4);
        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.FLOAT, q1q4Data);
        
        // Read from COLOR_ATTACHMENT1 (Q5Q8: f4, f5, f6, f7)
        const q5q8Data = new Float32Array(4);
        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.FLOAT, q5q8Data);
        
        // Read from COLOR_ATTACHMENT2 (Q9: f8)
        const q9Data = new Float32Array(1);
        gl.readBuffer(gl.COLOR_ATTACHMENT2);
        gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RED, gl.FLOAT, q9Data);
        
        // D2Q9 distribution functions
        const f = [
            q1q4Data[0], // f0 (center)
            q1q4Data[1], // f1 (right)
            q1q4Data[2], // f2 (top)
            q1q4Data[3], // f3 (left)
            q5q8Data[0], // f4 (bottom)
            q5q8Data[1], // f5 (top-right)
            q5q8Data[2], // f6 (top-left)
            q5q8Data[3], // f7 (bottom-left)
            q9Data[0]    // f8 (bottom-right)
        ];

        // Calculate density (pressure) - sum of all distributions
        const density = f.reduce((sum, val) => sum + val, 0);

        // Calculate velocity components
        const ux = (f[1] - f[3] + f[5] - f[6] - f[7] + f[8]) / (density || 1.0);
        const uy = (f[2] - f[4] + f[5] + f[6] - f[7] - f[8]) / (density || 1.0);
        const speed = Math.sqrt(ux * ux + uy * uy);

        // Draw D2Q9 lattice
        if (d2q9Ctx) {
            drawD2Q9Lattice(d2q9Ctx, f);
        }

        // Update hover info display
        hoverInfoContent.innerHTML = `
<span class="label">Position:</span> <span class="value">${x}, ${y}</span>
<span class="label">Density:</span> <span class="value">${density.toFixed(CONFIG.HOVER_INFO_DECIMAL_PLACES)}</span>
<span class="label">Velocity:</span> <span class="value">${speed.toFixed(CONFIG.HOVER_INFO_DECIMAL_PLACES)}</span>
<span class="label">Vx:</span> <span class="value">${ux.toFixed(CONFIG.HOVER_INFO_DECIMAL_PLACES)}</span>
<span class="label">Vy:</span> <span class="value">${uy.toFixed(CONFIG.HOVER_INFO_DECIMAL_PLACES)}</span>
        `.trim();

        // Position the hover info near the mouse
        hoverInfoDiv.style.display = 'flex';
        hoverInfoDiv.style.left = (clientX + CONFIG.HOVER_INFO_OFFSET_X) + 'px';
        hoverInfoDiv.style.top = (clientY + CONFIG.HOVER_INFO_OFFSET_Y) + 'px';
    }

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
            const clampedWidth = clampValue(width, CONFIG.CANVAS_WIDTH_MIN, CONFIG.CANVAS_WIDTH_MAX);
            const clampedHeight = clampValue(height, CONFIG.CANVAS_HEIGHT_MIN, CONFIG.CANVAS_HEIGHT_MAX);
            
            canvasDimensions.width = clampedWidth;
            canvasDimensions.height = clampedHeight;
            
            if (canvasWidthInput) canvasWidthInput.value = String(clampedWidth);
            if (canvasHeightInput) canvasHeightInput.value = String(clampedHeight);
            
            // Resize canvas
            canvas.width = clampedWidth;
            canvas.height = clampedHeight;

            if (zoneOfInterest.bounds) {
                zoneOfInterest.bounds = {
                    xMin: Math.min(zoneOfInterest.bounds.xMin, canvas.width - 1),
                    xMax: Math.min(zoneOfInterest.bounds.xMax, canvas.width - 1),
                    yMin: Math.min(zoneOfInterest.bounds.yMin, canvas.height - 1),
                    yMax: Math.min(zoneOfInterest.bounds.yMax, canvas.height - 1)
                };
            }
            updateZoneOfInterestUi();
            
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
            for (let i = 0; i < CONFIG.MAX_TEXTURE_UNITS; i++) {
                gl.activeTexture(gl.TEXTURE0 + i);
                gl.bindTexture(gl.TEXTURE_2D, null);
            }
            
            console.log('Canvas resized to:', clampedWidth, 'x', clampedHeight);
            
            resetSimulation();
            SettingsCache.save(settings);
        }, CONFIG.CANVAS_RESIZE_DEBOUNCE_MS);
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

        const maxStepsPerFrame = CONFIG.MAX_STEPS_PER_FRAME;
        let stepsThisFrame = 0;

        while ((stepBudget >= 1.0 || simControl.stepRequests > 0) && stepsThisFrame < maxStepsPerFrame) {
            if (simControl.stepRequests > 0) {
                simControl.stepRequests -= 1;
            } else {
                stepBudget -= 1.0;
            }

            simulationIteration += 1;
            
            // Ramp airflow velocity gradually toward target
            if (boundaryMode.current === 'airflowTunnel') {
                const targetVelocity = boundaryModeParamsValues.airflowTunnel?.tunnelVelocity ?? 0.0;
                const maxRampRate = (boundaryModeParamsValues.airflowTunnel?.rampRate ?? 2.0) / 10000.0;
                const diff = targetVelocity - actualAirflowVelocity;
                if (Math.abs(diff) > maxRampRate) {
                    actualAirflowVelocity += Math.sign(diff) * maxRampRate;
                } else {
                    actualAirflowVelocity = targetVelocity;
                }
            } else {
                actualAirflowVelocity = 0.0;
            }
            boundaryModeParamsValues.actualAirflow = actualAirflowVelocity;
            
            if (hasEnabledMovingObjects()) {
                copyWallsToPrev();
                initializeWalls(simulationIteration, true);
            }

            runStep(gl, programs, readState, writeState, canvas, wallsTexture, prevWallsTexture, boundaryMode, boundaryModeParamsValues, initialization, mrtRelaxation);

            const temp = readState;
            readState = writeState;
            writeState = temp;
            stepsThisFrame += 1;
        }

        if (stepBudget > maxStepsPerFrame) {
            stepBudget = maxStepsPerFrame;
        }

        if (visualization.autoCalibrateEachFrame) {
            autoCalibrateVisualizationRange();
        }

        drawDisplay(gl, programs, readState, canvas, wallsTexture, visualization);
        
        // Capture frame for recording if active and simulation is playing
        if (recorder.isRecording && simControl.isPlaying && stepsThisFrame > 0) {
            recorder.captureFrame();
        }
        
        updateVelocityDisplay();
        updateHoverInfo();
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}







main();
