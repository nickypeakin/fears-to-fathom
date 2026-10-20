// The final picture. Scenes render in HDR into a multisampled target; a
// cheap two-level bloom makes lamps and city lights glow; then one pass
// tone-maps (ACES), adds a touch of film grain and vignette, letterboxes
// cutscenes, fades, and, when you put your eye to the door, bends the
// whole view through a fisheye peephole lens.

import * as THREE from 'three';

const quadVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const brightFrag = /* glsl */`
  uniform sampler2D tex;
  uniform float threshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tex, vUv).rgb;
    float l = max(c.r, max(c.g, c.b));
    float k = smoothstep(threshold, threshold * 2.5, l);
    gl_FragColor = vec4(c * k, 1.0);
  }
`;

const blurFrag = /* glsl */`
  uniform sampler2D tex;
  uniform vec2 dir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tex, vUv).rgb * 0.227;
    c += (texture2D(tex, vUv + dir * 1.385).rgb + texture2D(tex, vUv - dir * 1.385).rgb) * 0.316;
    c += (texture2D(tex, vUv + dir * 3.231).rgb + texture2D(tex, vUv - dir * 3.231).rgb) * 0.07;
    gl_FragColor = vec4(c, 1.0);
  }
`;

const finalFrag = /* glsl */`
  uniform sampler2D tex, bloomA, bloomB;
  uniform vec2 res;
  uniform float aspect, time, exposure, bloom, grain, vignette, bars, fade, fear, staticAmt, glitch, peep, peepFov, saturation;
  uniform vec3 fadeColor;
  varying vec2 vUv;

  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

  vec3 grab(vec2 uv, float ca) {
    vec3 c;
    c.r = texture2D(tex, uv + vec2(ca, 0.0)).r;
    c.g = texture2D(tex, uv).g;
    c.b = texture2D(tex, uv - vec2(ca, 0.0)).b;
    c += (texture2D(bloomA, uv).rgb * 0.7 + texture2D(bloomB, uv).rgb * 0.9) * bloom;
    return c;
  }

  void main() {
    vec2 uv = vUv;
    vec2 c = (uv - 0.5) * vec2(aspect, 1.0);   // screen-height units
    float mask = 1.0, rim = 0.0;
    float ca = 0.0004 + fear * 0.006;

    // tape tearing when something is very wrong
    if (glitch > 0.0) {
      float line = floor(uv.y * 240.0);
      uv.x += (h(vec2(line, floor(time * 24.0))) - 0.5) * glitch * 0.03;
      float row = floor(uv.y * 12.0);
      uv.x += step(1.0 - glitch * 0.4, h(vec2(row, floor(time * 18.0)))) * (h(vec2(row, time)) - 0.5) * 0.16 * glitch;
    }

    if (peep > 0.5) {
      // equidistant fisheye: angle grows linearly with distance from centre
      float R = 0.47;
      float r = length(c);
      float rho = r / R;
      float th = min(rho, 1.08) * radians(50.0);
      float k = tan(th) / tan(radians(peepFov * 0.5));
      vec2 d = r > 1e-5 ? c / r : vec2(0.0);
      uv = 0.5 + d * k * 0.5 * vec2(1.0 / aspect, 1.0);
      mask = 1.0 - smoothstep(0.97, 1.0, rho);
      rim = smoothstep(0.93, 1.0, rho) * (1.0 - smoothstep(1.0, 1.06, rho));
      ca += rho * rho * 0.004;
    } else {
      uv = 0.5 + (uv - 0.5) * (1.0 + fear * 0.02 * dot(c, c));
    }

    vec3 col = grab(uv, ca);
    if (peep > 0.5) {
      // soft at the edge of the lens, dimmer too
      float r = length(c) / 0.47;
      vec3 soft = (grab(uv + vec2(0.003, 0.0), ca) + grab(uv - vec2(0.003, 0.0), ca) + grab(uv + vec2(0.0, 0.003), ca) + grab(uv - vec2(0.0, 0.003), ca)) * 0.25;
      col = mix(col, soft, smoothstep(0.55, 0.95, r));
      col *= 1.0 - 0.55 * smoothstep(0.5, 1.0, r);
    }
    col = aces(col * exposure);
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, saturation);

    // grain and vignette
    col += (h(vUv * res + fract(time) * 100.0) - 0.5) * grain;
    float vig = smoothstep(1.05, 0.25, length(c * vec2(0.9, 1.1)));
    col *= mix(1.0, vig, vignette + fear * 0.35);

    // the rest of the door around the peephole, and the brass ring
    if (peep > 0.5) col = mix(vec3(0.012, 0.009, 0.007) + vec3(0.09, 0.06, 0.03) * rim, col, mask);

    // static
    float s = h(vUv * res * 0.5 + floor(time * 30.0));
    col = mix(col, vec3(s * 0.85), clamp(staticAmt, 0.0, 1.0));

    col = mix(col, fadeColor, clamp(fade, 0.0, 1.0));
    float bar = bars * 0.115;
    if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <colorspace_fragment>
  }
`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    this.grainOn = true;
    const hdr = { type: THREE.HalfFloatType };
    this.target = new THREE.WebGLRenderTarget(4, 4, { ...hdr, samples: 4 });
    this.a1 = new THREE.WebGLRenderTarget(4, 4, hdr);
    this.a2 = new THREE.WebGLRenderTarget(4, 4, hdr);
    this.b1 = new THREE.WebGLRenderTarget(4, 4, hdr);
    this.b2 = new THREE.WebGLRenderTarget(4, 4, hdr);
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: quadVert, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.bright = mk(brightFrag, { tex: { value: null }, threshold: { value: 1.1 } });
    this.blur = mk(blurFrag, { tex: { value: null }, dir: { value: new THREE.Vector2() } });
    this.u = {
      tex: { value: this.target.texture }, bloomA: { value: this.a1.texture }, bloomB: { value: this.b1.texture },
      res: { value: new THREE.Vector2(4, 4) }, aspect: { value: 1 }, time: { value: 0 },
      exposure: { value: 1 }, bloom: { value: 0.8 }, grain: { value: 0.025 }, vignette: { value: 0.5 },
      bars: { value: 0 }, fade: { value: 0 }, fadeColor: { value: new THREE.Color(0, 0, 0) },
      fear: { value: 0 }, staticAmt: { value: 0 }, glitch: { value: 0 }, peep: { value: 0 }, peepFov: { value: 110 }, saturation: { value: 1 },
    };
    this.final = mk(finalFrag, this.u);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // Full resolution (up to 1.5x on high-density screens) times `quality`,
  // which drops on computers that can't keep up.
  setSize(w, h, quality = 1) {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
    const rw = Math.max(2, Math.round(w * scale)), rh = Math.max(2, Math.round(h * scale));
    this.target.setSize(rw, rh);
    const q = (t, d) => t.setSize(Math.max(1, Math.round(rw / d)), Math.max(1, Math.round(rh / d)));
    q(this.a1, 4); q(this.a2, 4); q(this.b1, 12); q(this.b2, 12);
    this.u.res.value.set(rw, rh);
    this.u.aspect.value = w / h;
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h, false);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  // draw(target) renders the world into `target`; fx holds the effects
  render(draw, fx) {
    const r = this.renderer;
    draw(this.target);
    // bloom: bright pass, then blur at a quarter and a twelfth of the size
    this.bright.uniforms.tex.value = this.target.texture;
    this.pass(this.bright, this.a1);
    const blur = (src, dst, dx, dy) => {
      this.blur.uniforms.tex.value = src.texture;
      this.blur.uniforms.dir.value.set(dx / src.width, dy / src.height);
      this.pass(this.blur, dst);
    };
    blur(this.a1, this.a2, 1, 0); blur(this.a2, this.a1, 0, 1);
    blur(this.a1, this.b2, 1, 0); blur(this.b2, this.b1, 0, 1);
    blur(this.b1, this.b2, 1.5, 0); blur(this.b2, this.b1, 0, 1.5);
    const u = this.u;
    u.time.value = fx.time || 0;
    u.exposure.value = fx.exposure ?? 1;
    u.bars.value = fx.bars || 0;
    u.fade.value = fx.fade || 0;
    u.fear.value = fx.fear || 0;
    u.staticAmt.value = fx.staticAmt || 0;
    u.glitch.value = fx.glitch || 0;
    u.peep.value = fx.peep ? 1 : 0;
    u.saturation.value = fx.saturation ?? 1;
    u.grain.value = this.grainOn ? 0.022 + (fx.noise || 0) : (fx.noise || 0);
    u.vignette.value = this.grainOn ? 0.45 : 0.15;
    if (fx.fadeColor != null) u.fadeColor.value.set(fx.fadeColor);
    this.quad.material = this.final;
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
