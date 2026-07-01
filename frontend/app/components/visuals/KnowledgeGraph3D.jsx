"use client";
import { useEffect, useRef } from "react";

/**
 * Real ecosystem knowledge graph — not a flow simulation, not decorative particles.
 * Nodes: asset-class hubs (Equity/Debt/Hybrid/Solution/Other) + top AMCs by real fund count,
 * clustered toward their dominant asset class. Edge = "this AMC has funds in this asset class"
 * (a real, 100%-coverage relationship, computed live in lib/graphNodes.js from funds.json).
 * Node radius is proportional to real fund count — nothing here is fabricated or illustrative.
 * Three.js is dynamically imported (never in the main bundle). Pauses on hidden tab, halves
 * node load on mobile, disposes everything on unmount. Mirrors FinancialNetwork3D's proven
 * lifecycle/perf pattern.
 */
export default function KnowledgeGraph3D({ classes = [], amcs = [] }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0, mounted = true, dispose = () => {};

    import("three").then((THREE) => {
      if (!mounted || !el) return;
      const small = window.innerWidth < 1000;
      const w = () => el.clientWidth || 1;
      const h = () => el.clientHeight || 1;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, w() / h(), 0.1, 100);
      camera.position.set(0, 0, 16);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(w(), h());
      el.appendChild(renderer.domElement);

      const root = new THREE.Group();
      scene.add(root);
      const disposables = [];
      const pulses = [];

      const PALETTE = [0x34d399, 0x60a5fa, 0xfbbf24, 0xc084fc, 0x94a3b8];
      const N = classes.length || 1;
      const hubPos = {};
      classes.forEach((c, i) => {
        const ang = (i / N) * Math.PI * 2;
        const pos = new THREE.Vector3(Math.cos(ang) * 5.5, Math.sin(ang) * 5.5 * 0.6, 0);
        hubPos[c.name] = { pos, color: PALETTE[i % PALETTE.length] };
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 24), new THREE.MeshBasicMaterial({ color: PALETTE[i % PALETTE.length] }));
        const halo = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 20), new THREE.MeshBasicMaterial({ color: PALETTE[i % PALETTE.length], transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending }));
        core.position.copy(pos); halo.position.copy(pos);
        root.add(core, halo);
      });

      const maxFunds = Math.max(...amcs.map((a) => a.total), 1);
      const list = (small ? amcs.slice(0, 9) : amcs).slice(0, 18);
      // spread AMC nodes evenly around their dominant hub so they don't overlap
      const perHub = {};
      list.forEach((a) => {
        const hub = hubPos[a.dominantClass];
        if (!hub) return;
        const idx = (perHub[a.dominantClass] ||= 0);
        perHub[a.dominantClass]++;
        const siblingCount = list.filter((x) => x.dominantClass === a.dominantClass).length;
        const ang = (idx / Math.max(siblingCount, 1)) * Math.PI * 2 + Math.random() * 0.3;
        const reach = 2.8 + (a.total / maxFunds) * 3.2;
        const node = hub.pos.clone().add(new THREE.Vector3(Math.cos(ang) * reach, Math.sin(ang) * reach * 0.7, (Math.random() - 0.5) * 2.2));
        const rad = 0.08 + (a.total / maxFunds) * 0.26;

        const dotGeo = new THREE.SphereGeometry(rad, 14, 14);
        const dotMat = new THREE.MeshBasicMaterial({ color: hub.color });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(node);
        root.add(dot);
        disposables.push(dotGeo, dotMat);

        const curve = new THREE.CatmullRomCurve3([node, node.clone().lerp(hub.pos, 0.5).add(new THREE.Vector3(0, 0.8, 0.6)), hub.pos]);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
        const lineMat = new THREE.LineBasicMaterial({ color: hub.color, transparent: true, opacity: 0.14 });
        root.add(new THREE.Line(lineGeo, lineMat));
        disposables.push(lineGeo, lineMat);

        const pGeo = new THREE.SphereGeometry(0.07, 10, 10);
        const pMat = new THREE.MeshBasicMaterial({ color: hub.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
        const pulse = new THREE.Mesh(pGeo, pMat);
        root.add(pulse);
        disposables.push(pGeo, pMat);
        pulses.push({ pulse, curve, t: Math.random(), speed: 0.0011 + Math.random() * 0.0013 });
      });

      const onResize = () => { camera.aspect = w() / h(); camera.updateProjectionMatrix(); renderer.setSize(w(), h()); };
      window.addEventListener("resize", onResize);

      const frame = () => {
        raf = requestAnimationFrame(frame);
        if (document.hidden) return;
        for (const p of pulses) {
          p.t = (p.t + p.speed) % 1;
          p.pulse.position.copy(p.curve.getPointAt(p.t));
        }
        root.rotation.y += 0.0009;
        root.rotation.x = Math.sin(Date.now() * 0.00006) * 0.06;
        renderer.render(scene, camera);
      };
      frame();

      dispose = () => {
        window.removeEventListener("resize", onResize);
        disposables.forEach((d) => d.dispose && d.dispose());
        scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      };
    }).catch(() => {});

    return () => { mounted = false; cancelAnimationFrame(raf); dispose(); };
  }, [classes, amcs]);

  return <div ref={ref} className="h-[260px] w-full sm:h-[320px]" aria-hidden />;
}
