import * as THREE from 'three';

export interface ViewportBounds {
  halfWidth: number;
  halfHeight: number;
  width: number;
  height: number;
  depth: number;
}

export class VisualizationScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;

  // Debug visualizer markers (Interaction Cursors)
  private cursorGroupA: THREE.Group;
  private cursorGroupB: THREE.Group;
  private cursorRingMatA: THREE.MeshBasicMaterial;
  private cursorRingMatB: THREE.MeshBasicMaterial;
  private cursorCoreMatA: THREE.MeshBasicMaterial;
  private cursorCoreMatB: THREE.MeshBasicMaterial;
  private debugVisible = false;

  private onResizeCallbacks: Array<(bounds: ViewportBounds) => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Pure Black Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // 2. Camera setup: 60° FOV, at (0, 0, 115) looking at origin
    const width = Math.max(container.clientWidth || window.innerWidth, 100);
    const height = Math.max(container.clientHeight || window.innerHeight, 100);
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 115);
    this.camera.lookAt(0, 0, 0);

    // 3. High Performance WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: false,
      alpha: false,
      stencil: false,
      depth: false,
    });

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 1.0);

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // 4. Interactive Hand Visual Cursors (Hand A and Hand B)
    this.cursorGroupA = new THREE.Group();
    this.cursorGroupB = new THREE.Group();

    const ringGeo = new THREE.RingGeometry(2.4, 3.2, 32);
    const coreGeo = new THREE.CircleGeometry(1.0, 24);

    this.cursorRingMatA = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.cursorCoreMatA = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });

    this.cursorRingMatB = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.cursorCoreMatB = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });

    const ringA = new THREE.Mesh(ringGeo, this.cursorRingMatA);
    const coreA = new THREE.Mesh(coreGeo, this.cursorCoreMatA);
    this.cursorGroupA.add(ringA);
    this.cursorGroupA.add(coreA);

    const ringB = new THREE.Mesh(ringGeo, this.cursorRingMatB);
    const coreB = new THREE.Mesh(coreGeo, this.cursorCoreMatB);
    this.cursorGroupB.add(ringB);
    this.cursorGroupB.add(coreB);

    this.cursorGroupA.visible = false;
    this.cursorGroupB.visible = false;
    this.scene.add(this.cursorGroupA);
    this.scene.add(this.cursorGroupB);

    // 5. Setup Responsive Resize Observer
    this.setupResizeObserver();
  }

  public getVisibleBounds(targetZ: number = 0): ViewportBounds {
    const dist = Math.max(1, this.camera.position.z - targetZ);
    const vFovRad = (this.camera.fov * Math.PI) / 360.0;
    const halfHeight = Math.tan(vFovRad) * dist;
    const halfWidth = halfHeight * this.camera.aspect;

    return {
      halfWidth,
      halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
      depth: 40,
    };
  }

  public onResize(callback: (bounds: ViewportBounds) => void): void {
    this.onResizeCallbacks.push(callback);
    callback(this.getVisibleBounds());
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.handleResize(width, height);
        }
      }
    });
    this.resizeObserver.observe(this.container);
  }

  public handleResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const bounds = this.getVisibleBounds();
    for (const cb of this.onResizeCallbacks) {
      cb(bounds);
    }
  }

  public setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    if (!visible) {
      this.cursorGroupA.visible = false;
      this.cursorGroupB.visible = false;
    }
  }

  public updateDebugMarkers(
    handA: { x: number; y: number; z: number; gesture?: string } | null,
    handB: { x: number; y: number; z: number; gesture?: string } | null
  ): void {
    if (!this.debugVisible) {
      this.cursorGroupA.visible = false;
      this.cursorGroupB.visible = false;
      return;
    }

    if (handA) {
      this.cursorGroupA.position.set(handA.x, handA.y, handA.z + 1.5);
      this.cursorGroupA.visible = true;

      if (handA.gesture === 'OPEN_PALM') {
        this.cursorRingMatA.color.setHex(0x34d399); // Emerald
      } else if (handA.gesture === 'PINCH') {
        this.cursorRingMatA.color.setHex(0xfbbf24); // Amber
      } else {
        this.cursorRingMatA.color.setHex(0x38bdf8); // Cyan
      }
    } else {
      this.cursorGroupA.visible = false;
    }

    if (handB) {
      this.cursorGroupB.position.set(handB.x, handB.y, handB.z + 1.5);
      this.cursorGroupB.visible = true;

      if (handB.gesture === 'OPEN_PALM') {
        this.cursorRingMatB.color.setHex(0x34d399);
      } else if (handB.gesture === 'PINCH') {
        this.cursorRingMatB.color.setHex(0xfbbf24);
      } else {
        this.cursorRingMatB.color.setHex(0xc084fc); // Purple
      }
    } else {
      this.cursorGroupB.visible = false;
    }
  }

  public getCanvasMetrics(): {
    clientWidth: number;
    clientHeight: number;
    drawingBufferWidth: number;
    drawingBufferHeight: number;
    pixelRatio: number;
  } {
    const dom = this.renderer.domElement;
    return {
      clientWidth: dom.clientWidth,
      clientHeight: dom.clientHeight,
      drawingBufferWidth: this.renderer.domElement.width,
      drawingBufferHeight: this.renderer.domElement.height,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    const canvas = this.renderer.domElement;
    if (canvas && canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }
    this.cursorRingMatA.dispose();
    this.cursorCoreMatA.dispose();
    this.cursorRingMatB.dispose();
    this.cursorCoreMatB.dispose();
    this.renderer.dispose();
    this.onResizeCallbacks = [];
  }
}
