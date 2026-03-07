export const BITMAP_TEXTURE_UNIT = 6;

export function createCustomBitmapState() {
    return {
        texture: null,
        width: 0,
        height: 0,
        loaded: false,
        fileName: '',
        sourceDataUrl: null
    };
}

export function clearCustomBitmapState(gl, customBitmapState) {
    customBitmapState.loaded = false;
    customBitmapState.width = 0;
    customBitmapState.height = 0;
    customBitmapState.fileName = '';
    customBitmapState.sourceDataUrl = null;

    if (customBitmapState.texture) {
        gl.deleteTexture(customBitmapState.texture);
        customBitmapState.texture = null;
    }
}

function decodeImageFromSource(source) {
    return new Promise((resolve, reject) => {
        const imageElement = new Image();
        imageElement.onload = () => resolve(imageElement);
        imageElement.onerror = () => reject(new Error('Failed to decode image.'));
        imageElement.src = source;
    });
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read file as data URL.'));
        reader.readAsDataURL(file);
    });
}

function buildMaskFromImage(imageElement) {
    const width = imageElement.naturalWidth || imageElement.width;
    const height = imageElement.naturalHeight || imageElement.height;
    if (!width || !height) {
        throw new Error('Image has invalid dimensions.');
    }

    const bitmapCanvas = document.createElement('canvas');
    bitmapCanvas.width = width;
    bitmapCanvas.height = height;

    const bitmapCtx = bitmapCanvas.getContext('2d', { willReadFrequently: true });
    if (!bitmapCtx) {
        throw new Error('Unable to create bitmap processing context.');
    }

    bitmapCtx.imageSmoothingEnabled = false;
    bitmapCtx.clearRect(0, 0, width, height);
    bitmapCtx.drawImage(imageElement, 0, 0, width, height);

    const imageData = bitmapCtx.getImageData(0, 0, width, height).data;
    const maskData = new Uint8Array(width * height);

    for (let sourceIndex = 0, targetIndex = 0; sourceIndex < imageData.length; sourceIndex += 4, targetIndex += 1) {
        const r = imageData[sourceIndex];
        const g = imageData[sourceIndex + 1];
        const b = imageData[sourceIndex + 2];
        const a = imageData[sourceIndex + 3];
        const brightness = (r + g + b) / 3;
        maskData[targetIndex] = (a > 8 && brightness > 20) ? 255 : 0;
    }

    return { width, height, maskData };
}

function uploadMaskTexture(gl, customBitmapState, width, height, maskData) {
    if (!customBitmapState.texture) {
        customBitmapState.texture = gl.createTexture();
    }

    gl.activeTexture(gl.TEXTURE0 + BITMAP_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, customBitmapState.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, maskData);

    customBitmapState.width = width;
    customBitmapState.height = height;
    customBitmapState.loaded = true;
}

export async function loadCustomBitmapFromFile(gl, customBitmapState, file) {
    if (!file) return;

    const dataUrl = await readFileAsDataUrl(file);
    await loadCustomBitmapFromDataUrl(gl, customBitmapState, dataUrl, file.name);
}

export async function loadCustomBitmapFromDataUrl(gl, customBitmapState, dataUrl, fileName = 'Cached Bitmap') {
    if (!dataUrl) return;

    const loaded = await decodeImageFromSource(dataUrl);
    const { width, height, maskData } = buildMaskFromImage(loaded);
    uploadMaskTexture(gl, customBitmapState, width, height, maskData);
    customBitmapState.fileName = fileName;
    customBitmapState.sourceDataUrl = dataUrl;
}
