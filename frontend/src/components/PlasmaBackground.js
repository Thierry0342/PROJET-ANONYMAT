import React, { useEffect, useRef } from 'react';

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255]
        : [1, 0.5, 0.2];
};

// Shader de sommet (Vertex) simple pour couvrir l'écran
const vertexShaderSource = `#version 300 es
in vec2 position;
void main() {
    gl_Position = vec4(position, 0.0, 1.0);
}`;

// Le Shader de fragment (ton modèle)
const fragmentShaderSource = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uCustomColor;
uniform float uUseCustomColor;
uniform float uSpeed;
uniform float uDirection;
uniform float uScale;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseInteractive;
out vec4 fragColor;

void mainImage(out vec4 o, vec2 C) {
    vec2 center = iResolution.xy * 0.5;
    C = (C - center) / uScale + center;
    
    vec2 mouseOffset = (uMouse - center) * 0.0002;
    C += mouseOffset * length(C - center) * step(0.5, uMouseInteractive);
    
    float i, d, z, T = iTime * uSpeed * uDirection;
    vec3 O, p, S;

    for (vec2 r = iResolution.xy, Q; ++i < 60.; O += o.w/d*o.xyz) {
        p = z*normalize(vec3(C-.5*r,r.y)); 
        p.z -= 4.; 
        S = p;
        d = p.y-T;
        
        p.x += .4*(1.+p.y)*sin(d + p.x*0.1)*cos(.34*d + p.x*0.05); 
        Q = p.xz *= mat2(cos(p.y+vec4(0,11,33,0)-T)); 
        z+= d = abs(sqrt(length(Q*Q)) - .25*(5.+S.y))/3.+8e-4; 
        o = 1.+sin(S.y+p.z*.5+S.z-length(S-p)+vec4(2,1,0,8));
    }
    
    o.xyz = tanh(O/1e4);
}

bool finite1(float x){ return !(isnan(x) || isinf(x)); }
vec3 sanitize(vec3 c){
    return vec3(
        finite1(c.r) ? c.r : 0.0,
        finite1(c.g) ? c.g : 0.0,
        finite1(c.b) ? c.b : 0.0
    );
}

void main() {
    vec4 o = vec4(0.0);
    mainImage(o, gl_FragCoord.xy);
    vec3 rgb = sanitize(o.rgb);
    
    float intensity = (rgb.r + rgb.g + rgb.b) / 3.0;
    vec3 customColor = intensity * uCustomColor;
    vec3 finalColor = mix(rgb, customColor, step(0.5, uUseCustomColor));
    
    float alpha = length(rgb) * uOpacity;
    fragColor = vec4(finalColor, alpha);
}`;

const PlasmaBackground = ({
    color = "#0367a6", 
    speed = 0.6,
    scale = 1.1,
    opacity = 0.8
}) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const gl = canvas.getContext('webgl2');

        if (!gl) return;

        // Compilation des shaders
        const createShader = (gl, type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vertShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertShader);
        gl.attachShader(program, fragShader);
        gl.linkProgram(program);

        // Création du rectangle (2 triangles) qui couvre l'écran
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        const positions = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1,
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const positionAttributeLocation = gl.getAttribLocation(program, "position");
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.enableVertexAttribArray(positionAttributeLocation);
        gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

        // Récupération des emplacements des Uniforms
        const locs = {
            iTime: gl.getUniformLocation(program, "iTime"),
            iResolution: gl.getUniformLocation(program, "iResolution"),
            uCustomColor: gl.getUniformLocation(program, "uCustomColor"),
            uUseCustomColor: gl.getUniformLocation(program, "uUseCustomColor"),
            uSpeed: gl.getUniformLocation(program, "uSpeed"),
            uDirection: gl.getUniformLocation(program, "uDirection"),
            uScale: gl.getUniformLocation(program, "uScale"),
            uOpacity: gl.getUniformLocation(program, "uOpacity"),
            uMouse: gl.getUniformLocation(program, "uMouse"),
            uMouseInteractive: gl.getUniformLocation(program, "uMouseInteractive"),
        };

        let animationFrameId;
        const startTime = performance.now();
        const rgbColor = hexToRgb(color);
        let mouseX = 0;
        let mouseY = 0;

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
        };

        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = canvas.height - (e.clientY - rect.top); // Inverser Y pour WebGL
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);
        handleResize();

        const render = (now) => {
            const time = (now - startTime) * 0.001;

            gl.useProgram(program);
            gl.bindVertexArray(vao);

            gl.uniform1f(locs.iTime, time);
            gl.uniform2f(locs.iResolution, canvas.width, canvas.height);
            gl.uniform3f(locs.uCustomColor, rgbColor[0], rgbColor[1], rgbColor[2]);
            gl.uniform1f(locs.uUseCustomColor, 1.0);
            gl.uniform1f(locs.uSpeed, speed * 0.4);
            gl.uniform1f(locs.uDirection, 1.0);
            gl.uniform1f(locs.uScale, scale);
            gl.uniform1f(locs.uOpacity, opacity);
            gl.uniform2f(locs.uMouse, mouseX, mouseY);
            gl.uniform1f(locs.uMouseInteractive, 1.0);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            animationFrameId = requestAnimationFrame(render);
        };

        render(performance.now());

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
            gl.deleteProgram(program);
        };
    }, [color, speed, scale, opacity]);

    return (
        <canvas 
            ref={canvasRef} 
            style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%', 
                zIndex: 0,
                display: 'block'
            }} 
        />
    );
};

export default PlasmaBackground;
