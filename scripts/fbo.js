
// FBO creation function
export function createFBO(gl, textures) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    
    // Verify textures are valid
    if (!textures.Q1Q4 || !textures.Q5Q8 || !textures.Q9) {
        console.error('Invalid textures passed to createFBO:', textures);
        throw new Error('Invalid textures for FBO creation');
    }
    
    // Attach your textures to the FBO
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures.Q1Q4, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, textures.Q5Q8, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, textures.Q9,   0);
    
    // Tell WebGL we are drawing to 3 targets at once
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    
    // Verify framebuffer is complete
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('FBO creation failed, status:', status.toString(16));
        console.error('Status codes: COMPLETE=0x8cd5, INCOMPLETE_ATTACHMENT=0x8cd6, INCOMPLETE_MISSING_ATTACHMENT=0x8cd7, INCOMPLETE_DIMENSIONS=0x8cd9');
    }
    
    return fbo;
}

// Separate FBO for wall initialization
export function createWallInitFBO(gl, wallTexture) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, wallTexture, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    
    // Verify framebuffer is complete
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Wall FBO creation failed, status:', status.toString(16));
    }
    
    return fbo;
}