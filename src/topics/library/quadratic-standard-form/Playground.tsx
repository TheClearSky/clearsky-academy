import { useCallback, useRef, useState } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { PlaygroundProps } from '../../contract';
import { PlaygroundCanvas, PlaygroundPanel, PlaygroundReadout, PlaygroundSlider } from '../../playgroundKit';
import type { SetupContext } from '../../playgroundKit';
import { discriminant, formatEquation, realRoots, samples, vertex } from './model';
import type { Quadratic } from './model';

/**
 * Play with ax² + bx + c = 0: three sliders bend the curve, drawn the
 * Crystal Line way — a gold lit line on the night grid. Its real roots
 * light as gold stations on the x-axis, the crystal sits at the vertex,
 * and at a = 0 the curve straightens into a red line: no longer quadratic.
 */

const X_RANGE = 6;
const GOLD = new THREE.Color('#f4e2a6');
const RED = new THREE.Color('#ff4d6d');

const format = (value: number) => (value < 0 ? `−${Math.abs(value).toFixed(1)}` : value.toFixed(1));

function setupScene(quadratic: { current: Quadratic }, reducedMotion: boolean) {
  return ({ renderer, width, height }: SetupContext) => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    const frame = (w: number, h: number) => {
      const halfY = (X_RANGE * h) / w;
      camera.left = -X_RANGE;
      camera.right = X_RANGE;
      camera.top = halfY;
      camera.bottom = -halfY;
      camera.updateProjectionMatrix();
      for (const material of [glowMaterial, coreMaterial]) material.resolution.set(w, h);
    };

    // The axes with unit ticks.
    const axisPoints: number[] = [-X_RANGE, 0, 0, X_RANGE, 0, 0, 0, -20, 0, 0, 20, 0];
    for (let x = -X_RANGE; x <= X_RANGE; x++) if (x !== 0) axisPoints.push(x, -0.09, 0, x, 0.09, 0);
    for (let y = -20; y <= 20; y++) if (y !== 0) axisPoints.push(-0.09, y, 0, 0.09, y, 0);
    const axes = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(axisPoints, 3)), new THREE.LineBasicMaterial({ color: '#7b6bc8', transparent: true, opacity: 0.75 }));
    scene.add(axes);

    // The curve: a wide soft glow under a bright core.
    const glowMaterial = new LineMaterial({ color: GOLD, linewidth: 12, transparent: true, opacity: 0.22, depthWrite: false });
    const coreMaterial = new LineMaterial({ color: GOLD, linewidth: 3.2 });
    const glow = new Line2(new LineGeometry(), glowMaterial);
    const core = new Line2(new LineGeometry(), coreMaterial);
    core.position.z = 0.01;
    scene.add(glow, core);

    // Root stations and the vertex crystal.
    const ringGeometry = new THREE.RingGeometry(0.17, 0.25, 40);
    const discGeometry = new THREE.CircleGeometry(0.15, 40);
    const stationMaterial = new THREE.MeshBasicMaterial({ color: '#f4e2a6' });
    const discMaterial = new THREE.MeshBasicMaterial({ color: '#d9a93c' });
    const stations = [0, 1].map(() => {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(ringGeometry, stationMaterial), new THREE.Mesh(discGeometry, discMaterial));
      group.position.z = 0.02;
      scene.add(group);
      return group;
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: '#6fe3ff' }));
    crystal.scale.set(0.8, 1.3, 0.8);
    const crystalHalo = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshBasicMaterial({ color: '#6fe3ff', transparent: true, opacity: 0.16 }));
    crystal.position.z = crystalHalo.position.z = 0.03;
    scene.add(crystalHalo, crystal);

    let drawn = '';
    const redraw = (q: Quadratic) => {
      const points = samples(q, -X_RANGE, X_RANGE, 241).map((value, index) => (index % 3 === 1 ? Math.max(-40, Math.min(40, value)) : value));
      glow.geometry.dispose();
      core.geometry.dispose();
      glow.geometry = new LineGeometry().setPositions(points);
      core.geometry = new LineGeometry().setPositions(points);
      glow.computeLineDistances();
      core.computeLineDistances();
      const quadratic = realRoots(q) !== null;
      coreMaterial.color.copy(quadratic ? GOLD : RED);
      glowMaterial.color.copy(quadratic ? GOLD : RED);
      const roots = realRoots(q) ?? [];
      stations.forEach((station, index) => {
        station.visible = index < roots.length;
        if (station.visible) station.position.x = roots[index];
      });
      const top = vertex(q);
      crystal.visible = crystalHalo.visible = top !== null;
      if (top) crystalHalo.position.set(top.x, top.y, 0.03);
    };

    frame(width, height);
    return {
      update(t: number) {
        const q = quadratic.current;
        const key = `${q.a}|${q.b}|${q.c}`;
        if (key !== drawn) {
          drawn = key;
          redraw(q);
        }
        const top = vertex(q);
        if (top) {
          const bob = reducedMotion ? 0 : Math.sin(t * 2.2) * 0.06;
          crystal.position.set(top.x, top.y + 0.35 + bob, 0.04);
          crystal.rotation.y = reducedMotion ? 0.6 : t * 0.9;
        }
        renderer.render(scene, camera);
      },
      resize: frame,
      dispose() {
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof Line2) object.geometry.dispose();
        });
        for (const material of [glowMaterial, coreMaterial, stationMaterial, discMaterial, axes.material, crystal.material, crystalHalo.material]) material.dispose();
      },
    };
  };
}

function QuadraticPlayground({ reducedMotion, active }: PlaygroundProps) {
  const [q, setQ] = useState<Quadratic>({ a: 1, b: -1, c: -2 });
  const live = useRef(q);
  live.current = q;
  // The scene reads the live values; it is set up once.
  const setup = useCallback((context: SetupContext) => setupScene(live, reducedMotion)(context), [reducedMotion]);
  const roots = realRoots(q);
  const d = discriminant(q);
  const set = (key: keyof Quadratic) => (value: number) => setQ((previous) => ({ ...previous, [key]: value }));

  return (
    <PlaygroundPanel
      title='The quadratic'
      controls={
        <>
          <PlaygroundSlider label='a' min={-3} max={3} step={0.1} value={q.a} onChange={set('a')} format={format} />
          <PlaygroundSlider label='b' min={-6} max={6} step={0.1} value={q.b} onChange={set('b')} format={format} />
          <PlaygroundSlider label='c' min={-6} max={6} step={0.1} value={q.c} onChange={set('c')} format={format} />
          <PlaygroundReadout>
            <strong>{formatEquation(q)}</strong>
            <br />
            {roots === null
              ? 'a = 0 — this is no longer a quadratic equation (a ≠ 0).'
              : `Discriminant ${format(d)} · ${roots.length === 0 ? 'no real roots' : roots.length === 1 ? `one root, x = ${format(roots[0])}` : `roots x = ${format(roots[0])} and ${format(roots[1])}`}`}
          </PlaygroundReadout>
        </>
      }
    >
      <PlaygroundCanvas key={String(reducedMotion)} active={active} reducedMotion={reducedMotion} label={`The graph of y = ${formatEquation(q).replace(' = 0', '')}`} setup={setup} />
    </PlaygroundPanel>
  );
}

export default QuadraticPlayground;
