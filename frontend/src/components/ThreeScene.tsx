import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { JobResult } from "../types";

type Props = {
  data: JobResult;
  width?: number | string;
  height?: number | string;
  pointSize?: number;
};

const ThreeScene: React.FC<Props> = ({ data, width = "100%", height = "100%", pointSize = 4 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    const widthPx = container.clientWidth || 800;
    const heightPx = container.clientHeight || 600;
    const camera = new THREE.PerspectiveCamera(45, widthPx / heightPx, 0.1, 1000);
    camera.position.set(0, 0, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(widthPx, heightPx);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // orbit-like controls (very small custom implementation)
    let isDown = false;
    let startX = 0;
    let startY = 0;
    let rotX = 0;
    let rotY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDown = true;
      startX = e.clientX;
      startY = e.clientY;
    };
    const onMouseUp = () => (isDown = false);
    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      const dx = (e.clientX - startX) * 0.01;
      const dy = (e.clientY - startY) * 0.01;
      rotX += dy;
      rotY += dx;
      startX = e.clientX;
      startY = e.clientY;
    };
    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);

    const handleResize = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    const animate = () => {
      if (sceneRef.current) {
        sceneRef.current.rotation.x = rotX;
        sceneRef.current.rotation.y = rotY;
      }
      if (renderer && camera) renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", handleResize);
      try {
        renderer.dispose();
        rendererRef.current = null;
      } catch {}
      while (container.firstChild) container.removeChild(container.firstChild);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // create/update trajectories in scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // remove previous trajectories
    const prev = scene.getObjectByName("trajectories");
    if (prev) {
      scene.remove(prev);
      prev.traverse((c) => {
        // @ts-ignore
        if (c.geometry) c.geometry.dispose();
        // @ts-ignore
        if (c.material) {
          // @ts-ignore
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          // @ts-ignore
          else c.material.dispose();
        }
      });
    }

    const group = new THREE.Group();
    group.name = "trajectories";

    // compute bounding box to frame camera
    const bboxMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    const bboxMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    data.trajectories?.forEach((traj, ti) => {
      // create a line geometry for the trajectory (up to 3 dims; if less, pad with 0)
      const pts: THREE.Vector3[] = traj.map((p) => {
        const x = p.length > 0 ? p[0] : 0;
        const y = p.length > 1 ? p[1] : 0;
        const z = p.length > 2 ? p[2] : 0;
        bboxMin.min(new THREE.Vector3(x, y, z));
        bboxMax.max(new THREE.Vector3(x, y, z));
        return new THREE.Vector3(x, y, z);
      });

      const geometry = new THREE.BufferGeometry().setFromPoints(pts);
      const color = new THREE.Color().setHSL((ti / Math.max(1, data.trajectories.length)) * 0.7, 0.6, 0.5);
      const material = new THREE.LineBasicMaterial({ color });

      const line = new THREE.Line(geometry, material);
      line.name = `traj-${ti}`;
      group.add(line);

      // optionally add a small sphere at the final point
      const last = pts[pts.length - 1];
      if (last) {
        const sphereGeom = new THREE.SphereGeometry(pointSize * 0.02, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color });
        const sphere = new THREE.Mesh(sphereGeom, sphereMat);
        sphere.position.copy(last);
        group.add(sphere);
      }
    });

    scene.add(group);

    // adjust camera to frame bbox
    const camera = cameraRef.current;
    if (camera) {
      const center = new THREE.Vector3().addVectors(bboxMin, bboxMax).multiplyScalar(0.5);
      const size = new THREE.Vector3().subVectors(bboxMax, bboxMin);
      const maxSize = Math.max(size.x, size.y, size.z, 1e-3);
      const distance = maxSize * 1.5 + 1;
      camera.position.set(center.x, center.y, center.z + distance);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
    }
  }, [data, pointSize]);

  return <div ref={containerRef} style={{ width, height, border: "1px solid #ddd" }} />;
};

export default ThreeScene;