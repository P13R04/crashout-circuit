/** Rend une seule scène WebGL à travers les différents cadrages de course. */
import { AmbientLight, BoxGeometry, Color, DirectionalLight, Fog, Mesh, MeshBasicMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import type { Material, Texture } from 'three';
import type { RaceViewState } from '../../server/protocol/raceView.js';
import type { ThemeId } from '../../server/protocol/theme.js';
import type { Team, TrackGeometry } from '../../server/types.js';
import type { CarPose } from '../raceMap/objects2d.js';
import { CarModel } from './carModel.js';
import { COCKPIT_FOG, shotFor, type CameraMode } from './cameras.js';
import { roadPaint, stipple } from './paint.js';
import { LOOKS } from './looks.js';
import { Venue } from './venue/Venue.js';
import { RaceObjects } from './RaceObjects.js';
import { RoadMesh } from './RoadMesh.js';

export class RaceScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(49, 1, 2, 3700);
  private roadMaterials = roadPaint(LOOKS.classic);
  private readonly road = new RoadMesh(this.roadMaterials);
  private readonly venue = new Venue();
  private readonly sun = new DirectionalLight(LOOKS.classic.light, 2.05);
  private theme: ThemeId = 'classic';
  private version = -1;
  private readonly objects = new RaceObjects();
  private readonly car = { A: new CarModel('A'), B: new CarModel('B') };
  private readonly cockpitFog = new Fog(LOOKS.classic.fog, COCKPIT_FOG.near, COCKPIT_FOG.far);
  private readonly nose = new Mesh(new BoxGeometry(4.8, .6, 7), new MeshBasicMaterial({ color: 0x203e43, fog: false }));
  private readonly ground;
  private width = 0;
  private height = 0;
  private slow = false;
  private frameTime = 0;
  private samples = 0;
  private elapsed = 0;
  private previousMode: CameraMode | null = null;
  private heading = 0;
  private lastStateTrack: TrackGeometry | null = null;
  private lastTrack: TrackGeometry['baseCenterline'] | null = null;
  private bounds = { center: { x: 960, y: 540 }, span: 1800 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    this.scene.background = new Color(LOOKS.classic.sky);
    this.scene.add(new AmbientLight(0xdce9ff, 1.65));
    this.sun.position.set(-300, 440, 260);
    this.scene.add(this.sun, this.camera, this.road.group, this.venue.root, this.objects.root, this.car.A.root, this.car.B.root);
    const texture = stipple(LOOKS.classic.ground, true);
    texture.repeat.set(110, 105);
    this.ground = new Mesh(new PlaneGeometry(6200, 6200), new MeshBasicMaterial({ map: texture }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(960, 0, 540);
    this.scene.add(this.ground);
    this.nose.position.set(0, -3.3, -7.5);
    this.camera.add(this.nose);
  }

  draw(state: RaceViewState, poses: Record<Team, CarPose>, mode: CameraMode, team: Team, now: number, reduced: boolean): void {
    if (!state.track || !this.resize()) return;
    const delta = this.profile();
    this.updateTrack(state.track, state.trackVersion, state.theme);
    const look = LOOKS[this.theme];
    const cockpit = mode === 'cockpit';
    this.scene.fog = cockpit ? this.cockpitFog : null;
    (this.scene.background as Color).set(cockpit ? look.fog : look.sky);
    const pose = poses[team];
    if (reduced || this.previousMode !== mode) this.heading = pose.angle;
    const d = pose.angle - this.heading;
    this.heading += Math.atan2(Math.sin(d), Math.cos(d)) * (mode === 'cockpit' ? .5 : .23);
    this.previousMode = mode;
    const shot = shotFor(mode, pose.pos, this.heading, this.bounds);
    this.camera.position.set(...shot.eye);
    this.camera.up.set(0, shot.top ? 0 : 1, shot.top ? -1 : 0);
    this.camera.lookAt(...shot.target);
    this.camera.fov = shot.fov;
    this.camera.far = shot.far;
    this.camera.updateProjectionMatrix();
    this.nose.visible = cockpit;
    this.nose.material.color.set(team === 'A' ? 0x457f89 : 0x9b4f68);
    this.updateCars(state, poses, cockpit ? team : null, reduced || state.phase !== 'RACE' ? 0 : delta);
    this.objects.update(state, now, reduced || this.slow);
    this.venue.animate(now, reduced || this.slow);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.venue.dispose();
    const materials = new Set<Material>(Object.values(this.roadMaterials)), textures = new Set<Texture>();
    this.scene.traverse(node => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material));
    });
    for (const material of materials) {
      if ('map' in material && material.map) textures.add(material.map as Texture);
      material.dispose();
    }
    for (const texture of textures) texture.dispose();
    this.renderer.dispose();
  }

  private updateCars(state: RaceViewState, poses: Record<Team, CarPose>, hidden: Team | null, delta: number): void {
    for (const team of ['A', 'B'] as const) {
      const model = this.car[team], pose = poses[team], car = state.cars[team];
      model.root.visible = team !== hidden && (team === 'A' || !state.soloTest);
      model.root.position.set(pose.pos.x, 0, pose.pos.y);
      model.root.rotation.y = -pose.angle;
      if (model.root.visible) model.animate(car.speed, car.disabled, delta);
    }
  }

  private updateTrack(track: TrackGeometry, version: number, theme: ThemeId): void {
    const changed = this.theme !== theme;
    if (changed) this.repaint(theme);
    if (this.version === version && !changed) return;
    this.road.update(track, version);
    const newCourse = !this.lastTrack || this.lastTrack.length !== track.baseCenterline.length
      || this.lastTrack.some((p, i) => p.x !== track.baseCenterline[i].x || p.y !== track.baseCenterline[i].y);
    if (newCourse || changed) this.venue.build(track, theme);
    this.lastTrack = track.baseCenterline;
    this.lastStateTrack = track;
    this.venue.followRoad(track);
    this.version = version;
    this.updateBounds(track);
  }

  private repaint(theme: ThemeId): void {
    const look = LOOKS[theme];
    this.theme = theme;
    this.sun.color.set(look.light);
    this.cockpitFog.color.set(look.fog);
    for (const material of Object.values(this.roadMaterials)) {
      material.map?.dispose();
      material.dispose();
    }
    this.roadMaterials = roadPaint(look);
    this.road.repaint(this.roadMaterials);
    this.ground.material.map?.dispose();
    const texture = stipple(look.ground, look.bands);
    texture.repeat.set(110, 105);
    this.ground.material.map = texture;
  }

  private updateBounds(track: TrackGeometry): void {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const edge of [track.outerEdge, track.innerEdge]) for (const p of edge) {
      left = Math.min(left, p.x); right = Math.max(right, p.x);
      top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
    }
    this.bounds = { center: { x: (left + right) / 2, y: (top + bottom) / 2 },
      span: Math.max(350, bottom - top, (right - left) / Math.min(1, this.camera.aspect)) + 150 };
  }

  private resize(): boolean {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return false;
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * (this.slow ? .5 : .75));
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      if (this.lastStateTrack) this.updateBounds(this.lastStateTrack);
    }
    return true;
  }

  private profile(): number {
    const t = performance.now(), dt = t - this.frameTime;
    this.frameTime = t;
    if (dt > 120) {
      this.elapsed = this.samples = 0;
      return 0;
    }
    this.elapsed += dt;
    this.samples++;
    if (!this.slow && this.elapsed >= 2000) {
      this.slow = this.elapsed / this.samples > 28;
      this.elapsed = this.samples = 0;
      if (this.slow) this.width = 0;
    }
    return dt / 1000;
  }
}
