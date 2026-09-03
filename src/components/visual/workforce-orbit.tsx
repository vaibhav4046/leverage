'use client';

import { useEffect, useRef } from 'react';

/**
 * Workforce orbit — the product as a rotating 3D object.
 *
 * One host node at the centre, workers on a tilted ring around it, each edge a
 * dispatch. It is a real perspective projection with depth sorting and depth-scaled
 * opacity, drawn on a 2D canvas: for a few dozen nodes, projecting by hand costs
 * nothing and avoids shipping a scene graph to draw twelve circles.
 *
 * The states come from the caller, so on the landing page this is fed by the
 * canonical run — the ring you see is the workforce that actually ran, including
 * the worker that was replaced.
 */

export interface OrbitNode {
  label: string;
  state: 'passed' | 'replaced' | 'running' | 'idle';
}

const STATE_COLOR: Record<OrbitNode['state'], string> = {
  passed: '74, 222, 128',
  replaced: '251, 191, 36',
  running: '255, 255, 255',
  idle: '120, 130, 155',
};

export function WorkforceOrbit({
  nodes,
  className = '',
}: {
  nodes: OrbitNode[];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef(nodes);

  // Kept in a ref so the animation loop reads the latest set without being torn
  // down and rebuilt on every parent render. Written in an effect, never during
  // render.
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let running = true;
    let angle = -0.35;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const draw = () => {
      resize();
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h);

      ctx.clearRect(0, 0, w, h);

      const list = nodesRef.current;
      const count = Math.max(list.length, 1);

      // Ring geometry. tilt flattens the circle into an ellipse in view space,
      // which is what sells it as a ring seen at an angle rather than a circle.
      const radius = scale * 0.34;
      const tilt = 0.42;

      const points = list.map((node, i) => {
        const theta = angle + (i / count) * Math.PI * 2;
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        const y = z * tilt;

        // Perspective: nearer nodes (larger z) get bigger and brighter.
        const depth = (z / radius + 1) / 2; // 0 far .. 1 near
        const persp = 0.72 + depth * 0.5;

        return { node, x: cx + x * persp, y: cy + y, depth, r: scale * 0.021 * persp };
      });

      // Edges first, so nodes sit on top of their own connections.
      for (const p of points) {
        const alpha = 0.06 + p.depth * 0.16;
        ctx.strokeStyle = `rgba(133, 166, 233, ${alpha})`;
        ctx.lineWidth = Math.max(1, scale * 0.0012);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      // Ring guide.
      ctx.strokeStyle = 'rgba(36, 55, 90, 0.5)';
      ctx.lineWidth = Math.max(1, scale * 0.001);
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius, radius * tilt, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Painter's algorithm: far nodes drawn before near ones.
      for (const p of [...points].sort((a, b) => a.depth - b.depth)) {
        const rgb = STATE_COLOR[p.node.state];
        const alpha = 0.35 + p.depth * 0.65;

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        glow.addColorStop(0, `rgba(${rgb}, ${alpha * 0.5})`);
        glow.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        if (p.depth > 0.55) {
          ctx.fillStyle = `rgba(199, 201, 209, ${(p.depth - 0.55) * 1.6})`;
          ctx.font = `${Math.round(scale * 0.026)}px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(p.node.label.slice(0, 18), p.x, p.y + p.r * 3.4);
        }
      }

      // Host core, last and brightest — it is the thing everything orbits.
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.1);
      core.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      core.addColorStop(0.28, 'rgba(133, 166, 233, 0.5)');
      core.addColorStop(1, 'rgba(98, 95, 255, 0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, scale * 0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(cx, cy, scale * 0.016, 0, Math.PI * 2);
      ctx.fill();
    };

    const frame = () => {
      if (!running) return;
      angle += 0.0022;
      draw();
      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced.matches) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };

    if (reduced.matches) {
      draw();
    } else {
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(frame);
    }

    const onResize = () => draw();
    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Workforce ring: ${nodes.length} workers around one host model`}
      className={`h-full w-full ${className}`}
    />
  );
}
