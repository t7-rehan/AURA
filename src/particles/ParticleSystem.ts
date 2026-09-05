import * as THREE from 'three';
import { particleVertexShader, particleFragmentShader } from './shaders/particleShaders';
import { PatternGenerator } from './ParticlePattern';
import type { ViewportBounds } from '../visualization/VisualizationScene';

export class ParticleSystem {
  public points: THREE.Points;
  public geometry: THREE.BufferGeometry;
  public material: THREE.ShaderMaterial;

  public positions: Float32Array;
  public velocities: Float32Array;
  public colors: Float32Array;
  public alphas: Float32Array;
  public sizes: Float32Array;

  private positionAttr: THREE.BufferAttribute;
  private velocityAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;

  public count: number;

  constructor(count: number, bounds?: ViewportBounds) {
    this.count = count;

    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.alphas = new Float32Array(count);
    this.sizes = new Float32Array(count);

    // Populate initial random cosmos field matching visible viewport bounds
    const hw = bounds ? bounds.halfWidth : 100;
    const hh = bounds ? bounds.halfHeight : 60;
    const initialField = PatternGenerator.generateRandomCosmos(count, hw, hh, 35);
    this.positions.set(initialField.positions);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Gentle initial thermal drift
      this.velocities[i3] = (Math.random() - 0.5) * 1.2;
      this.velocities[i3 + 1] = (Math.random() - 0.5) * 1.2;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 1.2;

      // Base colors (Cyan to Violet spectrum)
      const t = Math.random();
      this.colors[i3] = 0.15 * (1 - t) + 0.65 * t;
      this.colors[i3 + 1] = 0.75 * (1 - t) + 0.25 * t;
      this.colors[i3 + 2] = 1.0;

      this.alphas[i] = 0.5 + Math.random() * 0.5;
      this.sizes[i] = 2.4 + Math.pow(Math.random(), 2.0) * 4.2;
    }

    this.geometry = new THREE.BufferGeometry();

    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.velocityAttr = new THREE.BufferAttribute(this.velocities, 3);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.alphaAttr = new THREE.BufferAttribute(this.alphas, 1);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1);

    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    this.velocityAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('aVelocity', this.velocityAttr);
    this.geometry.setAttribute('aColor', this.colorAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('aSize', this.sizeAttr);

    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        uTime: { value: 0.0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uSizeMultiplier: { value: 1.0 },
        uGlobalOpacity: { value: 1.0 },
        uGlowIntensity: { value: 1.25 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  public markBuffersUpdated(): void {
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.velocityAttr.needsUpdate = true;
  }

  public setGlobalOpacity(opacity: number): void {
    this.material.uniforms.uGlobalOpacity.value = opacity;
  }

  public getGlobalOpacity(): number {
    return this.material.uniforms.uGlobalOpacity.value;
  }

  public setPixelRatio(dpr: number): void {
    this.material.uniforms.uPixelRatio.value = Math.min(dpr, 2.0);
  }

  public setTime(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
