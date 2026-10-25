import React, { useEffect, useRef, useState } from 'react';
import type { WorkshopPreviewMesh } from '../shared/types';

/**
 * Small WebGL viewer for the Workshop: draws a mod's meshes in gray and the part
 * being taken out in the theme color. Drag to turn, scroll to zoom.
 */

interface Props {
  meshes: WorkshopPreviewMesh[];
  highlight: string | null;
  /** CSS color for the highlighted part. Defaults to the theme's --primary. */
  color?: string;
  height?: number;
}

const VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uMvp;
uniform mat3 uRot;
varying vec3 vN;
void main() {
  vN = uRot * aNormal;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`;

const FS = `
precision mediump float;
uniform vec3 uColor;
uniform float uGlow;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float key = max(dot(n, normalize(vec3(0.35, 0.55, 0.75))), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.6, 0.2, 0.4))), 0.0) * 0.35;
  float rim = pow(1.0 - max(n.z, 0.0), 2.5) * (0.25 + uGlow * 0.6);
  vec3 c = uColor * (0.32 + key * 0.75 + fill) + rim * mix(vec3(1.0), uColor, 0.6);
  gl_FragColor = vec4(c, 1.0);
}`;

type Mat4 = Float32Array;

function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

/** Column-major 4x4 from a 3x3 rotation (rows) and a translation. */
function fromRot(r: number[][], t: [number, number, number] = [0, 0, 0]): Mat4 {
  return new Float32Array([r[0][0], r[1][0], r[2][0], 0, r[0][1], r[1][1], r[2][1], 0, r[0][2], r[1][2], r[2][2], 0, t[0], t[1], t[2], 1]);
}

function matMul3(a: number[][], b: number[][]): number[][] {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}

function parseColor(css: string): [number, number, number] {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return [0.4, 0.5, 1];
  ctx.fillStyle = '#000';
  ctx.fillStyle = css;
  const hex = ctx.fillStyle as string;
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (m) return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  const rgb = hex.match(/(\d+(?:\.\d+)?)/g);
  return rgb ? [Number(rgb[0]) / 255, Number(rgb[1]) / 255, Number(rgb[2]) / 255] : [0.4, 0.5, 1];
}

function smoothNormals(pos: Float32Array, idx: Uint32Array): Float32Array {
  const n = new Float32Array(pos.length);
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) {
      n[k] += nx;
      n[k + 1] += ny;
      n[k + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

export const PartViewer: React.FC<Props> = ({ meshes, highlight, color, height = 260 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const stateRef = useRef({ yaw: 0.6, pitch: 0.12, zoom: 1.15, dragging: false, touched: false });
  const drawRef = useRef<() => void>(() => undefined);
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl2 = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: false, alpha: true }) as WebGL2RenderingContext | null;
    const gl = (gl2 ?? canvas.getContext('webgl', { antialias: true, alpha: true })) as WebGLRenderingContext | null;
    if (!gl) {
      setFailed(true);
      return;
    }
    const uint32 = Boolean(gl2) || Boolean(gl.getExtension('OES_element_index_uint'));
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    const aPos = gl.getAttribLocation(prog, 'aPos');
    const aNormal = gl.getAttribLocation(prog, 'aNormal');
    const uMvp = gl.getUniformLocation(prog, 'uMvp');
    const uRot = gl.getUniformLocation(prog, 'uRot');
    const uColor = gl.getUniformLocation(prog, 'uColor');
    const uGlow = gl.getUniformLocation(prog, 'uGlow');

    // Bounds; the tallest axis is "up" (characters stand upright).
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const m of meshes) {
      const used = new Uint8Array(m.positions.length / 3);
      for (let i = 0; i < m.indices.length; i++) used[m.indices[i]] = 1;
      for (let v = 0; v < used.length; v++) {
        if (!used[v]) continue;
        for (let a = 0; a < 3; a++) {
          const x = m.positions[v * 3 + a];
          if (x < lo[a]) lo[a] = x;
          if (x > hi[a]) hi[a] = x;
        }
      }
    }
    if (!Number.isFinite(lo[0])) return;
    const size = [0, 1, 2].map((a) => hi[a] - lo[a]);
    const center = [0, 1, 2].map((a) => (hi[a] + lo[a]) / 2);
    const up = size.indexOf(Math.max(...size));
    const radius = Math.max(1e-4, Math.hypot(size[0], size[1], size[2]) / 2);
    // Basis that maps model axes to view axes: up -> +Y.
    const others = [0, 1, 2].filter((a) => a !== up);
    const basis: number[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    basis[0][others[0]] = 1;
    basis[1][up] = 1;
    basis[2][others[1]] = up === 1 ? 1 : -1; // view Z = X cross Y, keeps it right-handed

    const objs = meshes.map((m) => {
      const pos = new Float32Array(m.positions.length);
      for (let i = 0; i < pos.length; i++) pos[i] = (m.positions[i] - center[i % 3]) / radius;
      const normals = smoothNormals(pos, m.indices);
      const pb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pb);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      const nb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nb);
      gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      let count = m.indices.length;
      let type: number = gl.UNSIGNED_INT;
      if (uint32) gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
      else {
        const small = Uint16Array.from(m.indices.filter((x) => x < 65536));
        count = small.length - (small.length % 3);
        type = gl.UNSIGNED_SHORT;
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, small, gl.STATIC_DRAW);
      }
      return { part: m.part, pb, nb, ib, count, type };
    });

    const gray: [number, number, number] = [0.46, 0.48, 0.53];
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(prog);
      const st = stateRef.current;
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw);
      const cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const yawM = [
        [cy, 0, sy],
        [0, 1, 0],
        [-sy, 0, cy],
      ];
      const pitchM = [
        [1, 0, 0],
        [0, cp, -sp],
        [0, sp, cp],
      ];
      const rot = matMul3(pitchM, matMul3(yawM, basis));
      const dist = 2.9 / st.zoom;
      const proj = perspective(0.62, w / h, 0.05, 20);
      const mvp = mul(proj, fromRot(rot, [0, 0, -dist]));
      gl.uniformMatrix4fv(uMvp, false, mvp);
      gl.uniformMatrix3fv(uRot, false, new Float32Array([rot[0][0], rot[1][0], rot[2][0], rot[0][1], rot[1][1], rot[2][1], rot[0][2], rot[1][2], rot[2][2]]));
      const hl = parseColor(colorRef.current || getComputedStyle(canvas).getPropertyValue('--primary').trim() || '#4f5ff0');
      for (const o of objs) {
        const on = o.part === highlightRef.current;
        gl.uniform3fv(uColor, on ? hl : gray);
        gl.uniform1f(uGlow, on ? 1 : 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, o.pb);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, o.nb);
        gl.enableVertexAttribArray(aNormal);
        gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, o.ib);
        gl.drawElements(gl.TRIANGLES, o.count, o.type, 0);
      }
    };
    drawRef.current = draw;

    let raf = 0;
    let last = performance.now();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tick = (now: number) => {
      const st = stateRef.current;
      // App in the background: keep the model where it is and skip drawing.
      const paused = document.documentElement.hasAttribute('data-paused');
      if (!paused) {
        if (!st.dragging && !st.touched && !reduce) st.yaw += ((now - last) / 1000) * 0.45;
        draw();
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      for (const o of objs) {
        gl.deleteBuffer(o.pb);
        gl.deleteBuffer(o.nb);
        gl.deleteBuffer(o.ib);
      }
      gl.deleteProgram(prog);
    };
  }, [meshes]);

  useEffect(() => {
    drawRef.current();
  }, [highlight, color]);

  const onPointerDown = (e: React.PointerEvent) => {
    const st = stateRef.current;
    st.dragging = true;
    st.touched = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    let x = e.clientX, y = e.clientY;
    const move = (ev: PointerEvent) => {
      st.yaw += (ev.clientX - x) * 0.01;
      st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch + (ev.clientY - y) * 0.01));
      x = ev.clientX;
      y = ev.clientY;
    };
    const upFn = () => {
      st.dragging = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', upFn);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', upFn);
  };

  if (failed) return <div className="pv pv--empty small muted">3D preview isn’t available on this PC.</div>;
  return (
    <canvas
      ref={canvasRef}
      className="pv"
      style={{ height }}
      onPointerDown={onPointerDown}
      onWheel={(e) => {
        const st = stateRef.current;
        st.zoom = Math.max(0.6, Math.min(4, st.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      }}
      onDoubleClick={() => {
        Object.assign(stateRef.current, { yaw: 0.6, pitch: 0.12, zoom: 1.15, touched: false });
      }}
      role="img"
      aria-label={highlight ? `3D preview with the ${highlight} part highlighted` : '3D preview'}
    />
  );
};
