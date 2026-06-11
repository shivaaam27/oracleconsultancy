"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Living aurora backdrop for the command surface — a slow, fluid shimmer in the
 * app's accent colour rendered on a tiny WebGL canvas (no three.js; one
 * fullscreen fragment shader). Sits behind the glass panel so the whole thing
 * feels alive the moment it opens.
 *
 * Guards: respects prefers-reduced-motion (falls back to a static CSS gradient),
 * caps device-pixel-ratio for mobile perf, and tears the GL context down on
 * unmount. Loaded lazily by the palette so it costs nothing until opened.
 */
export function CommandBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [reduced, setReduced] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const u = () => setReduced(mq.matches);
    mq.addEventListener("change", u);
    return () => mq.removeEventListener("change", u);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, antialias: false, alpha: true });
    if (!gl) { setFailed(true); return; }

    // Accent colour from the live theme → linear-ish rgb for the shader.
    const accent = readAccentRgb();

    const vs = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
    const fs = `
      precision highp float;
      uniform vec2 u_res; uniform float u_time; uniform vec3 u_accent;
      // value-noise + fbm
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p);
        float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
        vec2 u=f*f*(3.0-2.0*f);
        return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
      }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
      void main(){
        vec2 uv = gl_FragCoord.xy / u_res.xy;
        vec2 q = uv; q.x *= u_res.x/u_res.y;
        float t = u_time*0.06;
        // two slow flowing fields
        float f1 = fbm(q*2.2 + vec2(t, t*0.7));
        float f2 = fbm(q*3.1 - vec2(t*0.8, t*0.5) + f1);
        float field = smoothstep(0.05, 0.85, f1*0.65 + f2*0.65);
        // accent + a cooler companion hue for depth, brightened for an aurora glow
        vec3 cool = u_accent.bgr * 0.9 + vec3(0.06,0.0,0.14);
        vec3 col = mix(cool, u_accent * 1.25, field);
        // gentle vignette so the glow still reaches the panel margins
        float vig = smoothstep(1.35, 0.1, distance(uv, vec2(0.5)));
        float alpha = field * vig * 0.9;
        gl_FragColor = vec4(col * alpha, alpha);
      }`;

    const prog = makeProgram(gl, vs, fs);
    if (!prog) { setFailed(true); return; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    // one big triangle covering the viewport
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    // Additive glow over the dark scrim (colour is pre-multiplied in the shader).
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uAccent = gl.getUniformLocation(prog, "u_accent");
    gl.uniform3f(uAccent, accent[0], accent[1], accent[2]);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };

    let raf = 0;
    const start = performance.now();
    const loop = () => {
      resize();
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Only stop the render loop on cleanup. We deliberately do NOT call
    // WEBGL_lose_context here: getContext() returns the same context object for a
    // given canvas, so losing it would poison the context that React's
    // StrictMode remount immediately reuses (shaders would then fail to compile).
    return () => { cancelAnimationFrame(raf); };
  }, [reduced]);

  // Reduced-motion or WebGL failure → a calm static accent gradient.
  if (reduced || failed) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 35%, hsl(var(--accent) / 0.18), transparent 70%)",
        }}
      />
    );
  }

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}

/* ---- WebGL helpers ---- */

function makeProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  return prog;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("Backdrop shader error:", gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

// Read --accent ("214 88% 52%") and convert HSL → rgb 0..1.
function readAccentRgb(): [number, number, number] {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const m = raw.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
    if (!m) return [0.2, 0.5, 0.95];
    return hslToRgb(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100);
  } catch {
    return [0.2, 0.5, 0.95];
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}
