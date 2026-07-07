"use client";
import { useEffect, useRef } from "react";

/**
 * Premium Interactive 3D Capital-Allocation Flow Network
 * - Category hubs (Equity / Debt / Hybrid) as glowing nodes.
 * - AMC nodes clustered toward their dominant category; radius ∝ |flow|.
 * - Liquidity "pulses" travel AMC → category along flow lines.
 * - Interactive pointer tilt (parallax) + hover raycasting with floating tooltip.
 * - Colour: positive flow = category color (emerald/blue/gold); negative = amber.
 */
export default function FinancialNetwork3D({ nodes = [] }) {
  const ref = useRef(null);
  const canvasRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    const el = canvasRef.current;
    const tooltip = tooltipRef.current;
    if (!el) return;
    
    let raf = 0;
    let mounted = true;
    let dispose = () => {};

    import("three").then((THREE) => {
      if (!mounted || !el) return;
      const small = window.innerWidth < 1000;
      const w = () => el.clientWidth || 1;
      const h = () => el.clientHeight || 1;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(52, w() / h(), 0.1, 100);
      camera.position.set(0, 0, 17);
      
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(w(), h());
      el.appendChild(renderer.domElement);

      const root = new THREE.Group();
      scene.add(root);

      const CATS = {
        Equity: { pos: new THREE.Vector3(-6.5, 2.2, 0), color: 0x34d399 },
        Debt: { pos: new THREE.Vector3(6.5, 2.2, 0), color: 0x60a5fa },
        Hybrid: { pos: new THREE.Vector3(0, -5, 0), color: 0xfbbf24 },
      };
      const NEG = 0xf59e0b;
      const interactiveObjects = [];
      const disposables = [];

      // Glowing category hubs
      for (const [name, c] of Object.entries(CATS)) {
        const coreGeo = new THREE.SphereGeometry(0.55, 24, 24);
        const coreMat = new THREE.MeshBasicMaterial({ color: c.color });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.copy(c.pos);
        core.userData = { name, type: "Category Hub", details: "Market Flow Aggregation Point" };
        
        root.add(core);
        interactiveObjects.push(core);
        disposables.push(coreGeo, coreMat);

        const haloGeo = new THREE.SphereGeometry(1.5, 20, 20);
        const haloMat = new THREE.MeshBasicMaterial({
          color: c.color,
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.copy(c.pos);
        root.add(halo);
        disposables.push(haloGeo, haloMat);
      }

      const maxFlow = Math.max(...nodes.flatMap((n) => [Math.abs(n.equity || 0), Math.abs(n.debt || 0)]), 1);
      const list = (small ? nodes.slice(0, 5) : nodes).slice(0, 9);
      const pulses = [];

      list.forEach((n, i) => {
        const links = [
          { cat: "Equity", v: n.equity || 0 },
          { cat: "Debt", v: n.debt || 0 },
        ].filter((l) => Math.abs(l.v) > 0);

        links.forEach((l) => {
          const hub = CATS[l.cat];
          const ang = (i / list.length) * Math.PI * 2;
          const reach = 4 + (Math.abs(l.v) / maxFlow) * 3.5;
          const node = hub.pos.clone().add(new THREE.Vector3(Math.cos(ang) * reach, Math.sin(ang) * reach * 0.5, (Math.random() - 0.5) * 3));
          const positive = l.v >= 0;
          const color = positive ? hub.color : NEG;
          const rad = 0.12 + (Math.abs(l.v) / maxFlow) * 0.34;

          const dotGeo = new THREE.SphereGeometry(rad, 14, 14);
          const dotMat = new THREE.MeshBasicMaterial({ color });
          const dot = new THREE.Mesh(dotGeo, dotMat);
          dot.position.copy(node);
          dot.userData = {
            name: n.name,
            type: "AMC Allocation",
            details: `Net Flow: ${l.v >= 0 ? "+" : ""}₹${Math.round(l.v)} Cr (${l.cat})`
          };
          
          root.add(dot);
          interactiveObjects.push(dot);
          disposables.push(dotGeo, dotMat);

          const curve = new THREE.CatmullRomCurve3([node, node.clone().lerp(hub.pos, 0.5).add(new THREE.Vector3(0, 1.2, 1)), hub.pos]);
          const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
          const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.16 });
          root.add(new THREE.Line(lineGeo, lineMat));
          disposables.push(lineGeo, lineMat);

          const pGeo = new THREE.SphereGeometry(0.09, 10, 10);
          const pMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
          const pulse = new THREE.Mesh(pGeo, pMat);
          root.add(pulse);
          disposables.push(pGeo, pMat);
          pulses.push({ pulse, curve, t: Math.random(), speed: 0.0016 + Math.random() * 0.0016 });
        });
      });

      // Mouse tracking for parallax tilt and raycasting
      const mouse = new THREE.Vector2(-999, -999);
      let targetRotX = 0, targetRotY = 0;
      let curRotX = 0, curRotY = 0;
      let baseRotY = 0;
      let hoveredObj = null;

      const onMouseMove = (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Tilt rotations
        targetRotX = mouse.y * 0.15;
        targetRotY = mouse.x * 0.18;
      };

      const onMouseLeave = () => {
        mouse.x = -999;
        mouse.y = -999;
        targetRotX = 0;
        targetRotY = 0;
        if (tooltip) tooltip.style.display = "none";
      };

      el.addEventListener("mousemove", onMouseMove);
      el.addEventListener("mouseleave", onMouseLeave);

      const onResize = () => {
        camera.aspect = w() / h();
        camera.updateProjectionMatrix();
        renderer.setSize(w(), h());
      };
      window.addEventListener("resize", onResize);

      const raycaster = new THREE.Raycaster();

      // Render/update loop
      const frame = () => {
        raf = requestAnimationFrame(frame);
        if (document.hidden) return;

        // Update pulses
        for (const p of pulses) {
          p.t = (p.t + p.speed) % 1;
          p.pulse.position.copy(p.curve.getPointAt(p.t));
        }

        // Apply hover tilt parallax
        curRotX += (targetRotX - curRotX) * 0.05;
        curRotY += (targetRotY - curRotY) * 0.05;
        root.rotation.x = curRotX;
        root.rotation.y = baseRotY + curRotY;

        baseRotY += 0.0007; // Slow rotation

        // Raycasting
        if (mouse.x !== -999) {
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(interactiveObjects);
          
          if (intersects.length > 0) {
            const obj = intersects[0].object;
            
            if (hoveredObj !== obj) {
              if (hoveredObj) hoveredObj.scale.set(1, 1, 1);
              hoveredObj = obj;
              obj.scale.set(1.4, 1.4, 1.4); // Highlight scale
            }

            if (tooltip) {
              const rect = el.getBoundingClientRect();
              const hitX = ((mouse.x + 1) / 2) * rect.width;
              const hitY = ((-mouse.y + 1) / 2) * rect.height;
              
              tooltip.innerHTML = `
                <div className="font-semibold text-white">${obj.userData.name}</div>
                <div className="text-[10px] text-ink-faint mt-0.5">${obj.userData.type} · ${obj.userData.details}</div>
              `;
              tooltip.style.left = `${hitX + 16}px`;
              tooltip.style.top = `${hitY - 24}px`;
              tooltip.style.display = "block";
            }
          } else {
            if (hoveredObj) {
              hoveredObj.scale.set(1, 1, 1);
              hoveredObj = null;
            }
            if (tooltip) tooltip.style.display = "none";
          }
        }

        renderer.render(scene, camera);
      };
      frame();

      dispose = () => {
        el.removeEventListener("mousemove", onMouseMove);
        el.removeEventListener("mouseleave", onMouseLeave);
        window.removeEventListener("resize", onResize);
        disposables.forEach((d) => d.dispose && d.dispose());
        scene.traverse((o) => {
          o.geometry?.dispose?.();
          o.material?.dispose?.();
        });
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    }).catch(() => {});

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      dispose();
    };
  }, [nodes]);

  return (
    <div ref={ref} className="relative w-full overflow-hidden">
      <div ref={canvasRef} className="h-[300px] w-full sm:h-[360px]" aria-hidden />
      
      {/* Floating Glowing Flow Tooltip */}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-20 hidden rounded-xl border border-white/[0.08] bg-[#0a0d14]/95 px-3 py-2 text-[11.5px] text-ink shadow-2xl backdrop-blur-xl transition-all duration-75"
        style={{ transform: "translateY(-50%)" }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-faint">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "#34d399" }} />Equity</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "#60a5fa" }} />Debt</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "#fbbf24" }} />Hybrid</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} />Outflow</span>
        <span>· node size ∝ net flow · pulses = capital movement</span>
      </div>
    </div>
  );
}
