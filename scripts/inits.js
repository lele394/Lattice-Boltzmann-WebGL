export async function setupBuffers(canvas, gl) {

    const width = canvas.width;
    const height = canvas.height;

    // FLoat support check
    if (!gl.getExtension('EXT_color_buffer_float')) {
        throw new Error("Float render targets not supported");
    }

    // unpack alignment flags
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    function createTexture(internalFormat, format) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);

        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            internalFormat,
            width,
            height,
            0,
            format,
            gl.FLOAT, 
            null // No data
        );

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        return tex;
    }

    // D2Q9 textures
    // I don't wanna deal with an RGBA texture for Q9, guess I could
    // pack some more stuff in it but oh well, will come back later if needed
    const Q1Q4 = createTexture(gl.RGBA32F, gl.RGBA);
    const Q5Q8 = createTexture(gl.RGBA32F, gl.RGBA);
    const Q9   = createTexture(gl.R32F,   gl.RED);

    return { Q1Q4, Q5Q8, Q9 };
}

export function createWallsTexture(canvas, gl) {
    const width = canvas.width;
    const height = canvas.height;

    const wallTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, wallTexture);

    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        width,
        height,
        0,
        gl.RGBA,
        gl.FLOAT, 
        null
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return wallTexture;
}