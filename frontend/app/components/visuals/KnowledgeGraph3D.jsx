"use client";
import { useEffect, useRef } from "react";

/**
 * Premium Interactive 3D Ecosystem Graph
 * - Background starfield representing the rotating investment universe.
 * - Mouse parallax/tilt: camera/group skews smoothly to follow the cursor.
 * - Interactive raycasting: hover highlights nodes (scales them up) and displays
 *   an HTML-based glowing tooltip.
 * - Responsive, optimized, full resource disposal on unmount.
 */
export default function KnowledgeGraph3D({ classes = [], amcs = [] }) {
  const containerRef = useRef(null);
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
      const interactiveObjects = [];

      // 1. Rotating Background Starfield (Investment Universe)
      const starCount = small ? 150 : 300;
      const starGeo = new THREE.BufferGeometry();
      const starPositions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        // Random positions inside a sphere
        const r = 15 + Math.random() * 25;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        starPositions[i * 3 + 2] = r * Math.cos(phi);
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
      
      const starMat = new THREE.PointsMaterial({
        color: 0x818cf8,
        size: 0.08,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending
      });
      const starField = new THREE.Points(starGeo, starMat);
      scene.add(starField);
      disposables.push(starGeo, starMat);

      // Colors palette
      const PALETTE = [0x34d399, 0x60a5fa, 0xfbbf24, 0xc084fc, 0x94a3b8];
      const N = classes.length || 1;
      const hubPos = {};

      // 2. Build Category Hub Nodes
      classes.forEach((c, i) => {
        const ang = (i / N) * Math.PI * 2;
        const pos = new THREE.Vector3(Math.cos(ang) * 5.5, Math.sin(ang) * 5.5 * 0.6, 0);
        hubPos[c.name] = { pos, color: PALETTE[i % PALETTE.length] };
        
        const coreGeo = new THREE.SphereGeometry(0.5, 24, 24);
        const coreMat = new THREE.MeshBasicMaterial({ color: PALETTE[i % PALETTE.length] });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.copy(pos);
        
        // Attach metadata for raycasting
        core.userData = { name: c.name, type: "Category", details: `${c.schemes || 0} schemes Tracked` };
        interactiveObjects.push(core);
        disposables.push(coreGeo, coreMat);

        const haloGeo = new THREE.SphereGeometry(1.3, 20, 20);
        const haloMat = new THREE.MeshBasicMaterial({
          color: PALETTE[i % PALETTE.length],
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.copy(pos);
        
        root.add(core, halo);
        disposables.push(haloGeo, haloMat);
      });

      // 3. Build AMC Nodes
      const maxFunds = Math.max(...amcs.map((a) => a.total), 1);
      const list = (small ? amcs.slice(0, 9) : amcs).slice(0, 18);
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

        // AMC sphere dot
        const dotGeo = new THREE.SphereGeometry(rad, 14, 14);
        const dotMat = new THREE.MeshBasicMaterial({ color: hub.color });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(node);
        dot.userData = { name: a.name, type: "AMC", details: `${a.total} Funds · dominant: ${a.dominantClass}` };
        
        root.add(dot);
        interactiveObjects.push(dot);
        disposables.push(dotGeo, dotMat);

        // Connections (curves) to Hubs
        const curve = new THREE.CatmullRomCurve3([node, node.clone().lerp(hub.pos, 0.5).add(new THREE.Vector3(0, 0.8, 0.6)), hub.pos]);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
        const lineMat = new THREE.LineBasicMaterial({ color: hub.color, transparent: true, opacity: 0.14 });
        root.add(new THREE.Line(lineGeo, lineMat));
        disposables.push(lineGeo, lineMat);

        // Flow particles
        const pGeo = new THREE.SphereGeometry(0.07, 10, 10);
        const pMat = new THREE.MeshBasicMaterial({ color: hub.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
        const pulse = new THREE.Mesh(pGeo, pMat);
        root.add(pulse);
        disposables.push(pGeo, pMat);
        pulses.push({ pulse, curve, t: Math.random(), speed: 0.0011 + Math.random() * 0.0013 });
      });

      // 4. Mouse Move Tracking (for Raycasting & Parallax)
      const mouse = new THREE.Vector2(-999, -999);
      let targetRotX = 0, targetRotY = 0;
      let curRotX = 0, curRotY = 0;
      let baseRotY = 0;
      let hoveredObj = null;

      const onMouseMove = (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Target tilt values for parallax
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

      // 5. Render/Update Loop
      const frame = () => {
        raf = requestAnimationFrame(frame);
        if (document.hidden) return;

        // 5a. Update pulses
        for (const p of pulses) {
          p.t = (p.t + p.speed) % 1;
          p.pulse.position.copy(p.curve.getPointAt(p.t));
        }

        // 5b. Apply mouse parallax with linear interpolation (lerp)
        curRotX += (targetRotX - curRotX) * 0.05;
        curRotY += (targetRotY - curRotY) * 0.05;
        root.rotation.x = curRotX;
        root.rotation.y = baseRotY + curRotY;
        
        baseRotY += 0.0006; // Slow continuous spin
        starField.rotation.y = baseRotY * 0.4; // Starfield rotates at a different speed for depth

        // 5c. Raycast pointer intersections
        if (mouse.x !== -999) {
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(interactiveObjects);
          
          if (intersects.length > 0) {
            const obj = intersects[0].object;
            
            // Highlight hovered node
            if (hoveredObj !== obj) {
              if (hoveredObj) hoveredObj.scale.set(1, 1, 1);
              hoveredObj = obj;
              obj.scale.set(1.4, 1.4, 1.4); // scale up
            }

            // Position & update tooltip
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

      // Clean up closure
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
  }, [classes, amcs]);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden">
      <div ref={canvasRef} className="h-[260px] w-full sm:h-[320px]" aria-hidden />
      
      {/* Dynamic Glowing Tooltip */}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-20 hidden rounded-xl border border-white/[0.08] bg-[#0a0d14]/95 px-3 py-2 text-[11.5px] text-ink shadow-2xl backdrop-blur-xl transition-all duration-75"
        style={{ transform: "translateY(-50%)" }}
      />
    </div>
  );
}
