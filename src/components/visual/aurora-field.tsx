'use client';

import { useEffect, useRef } from 'react';

/**
 * Volumetric aurora field.
 *
 * A hand-written WebGL fragment shader rather than a 3D library. Three.js would be
 * ~150KB gzipped for what is, in the end, one full-screen quad and some noise —
 * that is most of the landing page's entire JS budget spent on a background. This
 * is a few kilobytes and draws at the same quality.
 *
 * It degrades three ways, in order:
 *   - `prefers-reduced-motion`  -> renders one static frame, no loop
 *   - no WebGL                  -> renders nothing, the CSS aurora underneath shows
 *   - tab hidden or scrolled off-screen -> stops the loop, resumes where it paused
 *
 * The palette is the design system's, not the shader's own invention: aurora purple
 * and plasma pink over void, the same two glows the CSS uses.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uPointer;
uniform float uIntensity;

// Cheap value noise. A texture lookup would be sharper but this keeps the whole
// effect dependency-free and the softness suits an atmospheric field.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p  = (gl_FragCoord.xy - 0.5 * uRes.xy) / uRes.y;

  float t = uTime * 0.028;

  // Pointer parallax: the field leans toward the cursor. Subtle enough that it
  // reads as depth rather than as a toy following the mouse.
  vec2 lean = (uPointer - 0.5) * 0.16;

  // Two drifting noise domains, warped by each other, give the slow folding
  // motion that makes a flat gradient feel volumetric.
  vec2 q = vec2(fbm(p * 1.6 + vec2(0.0, t) + lean), fbm(p * 1.6 + vec2(4.3, -t)));
  vec2 r = vec2(
    fbm(p * 1.9 + 2.2 * q + vec2(1.7, 9.2) + t * 0.6),
    fbm(p * 1.9 + 2.2 * q + vec2(8.3, 2.8) - t * 0.4)
  );
  float f = fbm(p * 2.1 + 2.6 * r);

  vec3 void_    = vec3(0.043, 0.047, 0.055); // #0b0c0e
  vec3 purple   = vec3(0.384, 0.373, 1.000); // #625fff
  vec3 pink     = vec3(1.000, 0.490, 0.855); // #ff7dda
  vec3 cobalt   = vec3(0.071, 0.141, 0.310); // #12244f

  vec3 col = void_;

  // Upper-left purple mass, matching the CSS radial the rest of the page uses.
  float purpleMask = smoothstep(0.15, 0.95, f + 0.35 - length(p - vec2(-0.35, 0.55)) * 0.75);
  col = mix(col, purple, purpleMask * 0.38 * uIntensity);

  // Cobalt mid-body keeps it from reading as a flat purple wash.
  float cobaltMask = smoothstep(0.25, 0.9, f * 1.15 - length(p - vec2(0.15, 0.05)) * 0.55);
  col = mix(col, cobalt, cobaltMask * 0.55 * uIntensity);

  // Lower-right pink counterpoint, deliberately weaker than the purple.
  float pinkMask = smoothstep(0.3, 1.0, f + 0.2 - length(p - vec2(0.55, -0.6)) * 1.05);
  col = mix(col, pink, pinkMask * 0.22 * uIntensity);

  // Fade to void at the bottom so the section boundary is a real edge.
  col = mix(col, void_, smoothstep(0.55, 1.0, uv.y * 0.6 + 0.35));

  // Film grain. Without it the gradient bands visibly on an OLED panel.
  float grain = (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.022;
  col += grain;

  gl_FragColor = vec4(col, 1.0);
}
`;

export function AuroraField({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    });
    if (!gl) return; // CSS aurora underneath is the fallback.

    const program = buildProgram(gl, VERT, FRAG);
    if (!program) return;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'uRes');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uPointer = gl.getUniformLocation(program, 'uPointer');
    const uIntensity = gl.getUniformLocation(program, 'uIntensity');

    gl.useProgram(program);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = { x: 0.5, y: 0.5 };
    const target = { x: 0.5, y: 0.5 };

    // Cap the drawing buffer. A 4K panel would otherwise shade 8M fragments per
    // frame for a background nobody is looking at closely.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.min(canvas.clientWidth * dpr, 2200);
      const h = Math.min(canvas.clientHeight * dpr, 1400);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      target.x = (e.clientX - rect.left) / rect.width;
      target.y = 1 - (e.clientY - rect.top) / rect.height;
    };

    let raf = 0;
    let running = false;
    // The IntersectionObserver reports the true state on its first callback;
    // until then assume visible so the first frame is not held back.
    let inView = true;
    // The clock only advances while frames are drawn, so a field that scrolls
    // back into view carries on from where it paused instead of jumping phase.
    let elapsed = 0;
    let last = 0;

    const frame = (now: number) => {
      if (!running) return;
      resize();
      elapsed += now - last;
      last = now;

      // Ease the pointer so the parallax glides instead of snapping.
      pointer.x += (target.x - pointer.x) * 0.045;
      pointer.y += (target.y - pointer.y) * 0.045;

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, elapsed / 1000);
      gl.uniform2f(uPointer, pointer.x, pointer.y);
      gl.uniform1f(uIntensity, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      raf = requestAnimationFrame(frame);
    };

    const renderOnce = () => {
      resize();
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, 12);
      gl.uniform2f(uPointer, 0.5, 0.5);
      gl.uniform1f(uIntensity, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // One decision for every reason the loop may stop: tab hidden, reduced
    // motion, or the canvas scrolled out of view. Off-screen, rAF still fires at
    // full rate and the shader still burns GPU time that nobody can see.
    const sync = () => {
      const shouldRun = inView && !document.hidden && !reduced.matches;
      if (shouldRun === running) return;
      running = shouldRun;
      if (running) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
      }
    };

    const onReducedChange = () => {
      sync();
      if (reduced.matches) renderOnce();
    };

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    observer.observe(canvas);

    if (reduced.matches) renderOnce();
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', onReducedChange);
    sync();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', onReducedChange);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}

function buildProgram(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram | null {
  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const v = compile(gl.VERTEX_SHADER, vert);
  const f = compile(gl.FRAGMENT_SHADER, frag);
  if (!v || !f) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  gl.deleteShader(v);
  gl.deleteShader(f);

  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}
