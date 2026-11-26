// Printing pass. Takes the coverage canvas (r/g/b = three inks) and makes it look printed:
// edge roughness, bleed and squash (blur + threshold), ragged woodcut edges, speckle where ink
// didn't take, mottled density, paper grain, and misregistration between the inks.
// One shared WebGL2 context renders every tile; the result is copied out with drawImage.

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0., 1.); }`;

const NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3. - 2. * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
`;

// displacement + one direction of a gaussian blur
const BLUR = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 dir, res, asp, panUp; uniform float radius, rough, roughScale, seed, zoom; uniform int displace;
${NOISE}
vec2 disp(vec2 q) {
	if (displace == 0 || rough <= 0.) return q;
	vec2 u = (q * asp * 1000. / zoom + panUp) / roughScale + seed;
	vec2 d = vec2(fbm(u), fbm(u + 31.7)) - .5;
	return q + d * rough * zoom / 1000. / asp;
}
void main() {
	if (radius < .5) { o = texture(src, disp(uv)); return; }
	vec4 s = vec4(0.); float tw = 0.;
	float sig = radius / 2.;
	for (int i = -12; i <= 12; i++) {
		float x = float(i) * radius / 12.;
		float w = exp(-x * x / (2. * sig * sig));
		s += w * texture(src, disp(uv + dir * x / res));
		tw += w;
	}
	o = s / tw;
}`;

const FINAL = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D sharp, soft;
uniform vec3 paper, inkA, inkB, inkC;
uniform float bleed, spread, edge, edgeScale, speckle, dirt, mottle, grain, seed, rough, roughScale, zoom;
uniform vec2 asp, panUp, panDn;
uniform int clear; // 1: no paper, inks over transparency
uniform vec2 regA, regB, regC;
${NOISE}
vec2 disp(vec2 q) {
	if (rough <= 0.) return q;
	vec2 u = (q * asp * 1000. / zoom + panUp) / roughScale + seed;
	vec2 d = vec2(fbm(u), fbm(u + 31.7)) - .5;
	return q + d * rough * zoom / 1000. / asp;
}
float chan(vec2 off, int c) {
	vec2 q = uv + off * zoom / 1000. / asp;
	float a = texture(sharp, disp(q))[c];
	float b = texture(soft, q)[c];
	return bleed > 0. ? b : a;
}
float printed(float v, vec2 p) {
	float n = 0.;
	if (edge > 0.) n = (fbm(p / edgeScale + seed * .37) - .5) * edge * .9 + (h21(floor(p * 1.7) + seed) - .5) * edge * .25;
	float t = .42 - spread + n;
	float aa = max(fwidth(v) * .75, .004);
	return smoothstep(t - aa, t + aa, v);
}
void main() {
	// print coordinates: pinned to the page when the camera zooms and pans (zoom 1, no pan = the screen)
	vec2 p = uv * asp * 1000.;
	p.y = 1000. - p.y;
	p = p / zoom + panDn;
	float a = printed(chan(regA, 0), p), b = printed(chan(regB, 1), p), c = printed(chan(regC, 2), p);
	// ink that didn't take, density variation
	float mot = 1. - mottle * fbm(p * .045 + seed);
	float sp = speckle > 0. ? smoothstep(1. - speckle * .35, 1. - speckle * .35 + .06, vn(p * .55 + seed * 3.1) * .7 + vn(p * 1.9 + seed) * .3) : 0.;
	float keep = mot * (1. - sp);
	a *= keep; b *= keep; c *= keep;
	// stray ink on the paper
	if (dirt > 0.) {
		float d = step(1. - dirt * .012, h21(floor(p * .5) + seed * 1.3)) * step(.55, vn(p * 1.3));
		a = max(a, d * .9);
	}
	if (clear == 1) {
		// the inks over white, as colour + alpha: the same picture when laid over white paper
		vec3 C = mix(vec3(1.), inkA, a) * mix(vec3(1.), inkB, b) * mix(vec3(1.), inkC, c);
		float al = 1. - (1. - a) * (1. - b) * (1. - c);
		o = al > .002 ? vec4(clamp((C - (1. - al)) / al, 0., 1.), al) : vec4(0.);
		return;
	}
	float g = grain * ((fbm(p * .9 + 11.) - .5) * .12 + (h21(p * 1.37) - .5) * .05 + (fbm(vec2(p.x * .02, p.y * 1.4)) - .5) * .04);
	vec3 col = paper * (1. + g);
	col *= mix(vec3(1.), inkA, a);
	col *= mix(vec3(1.), inkB, b);
	col *= mix(vec3(1.), inkC, c);
	o = vec4(col, 1.);
}`;

import { clamp } from './util.js?v=a8136959';

// Gray–Scott reaction–diffusion on a grid, walls where the mask is 0.
// The mask is the texture's distance grid: unit x sits at texel (x / cell + .5) / nx, hence mk.
const RD_INIT = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform float seed, n;
float h(vec2 p) { p = fract(p * vec2(123.34, 456.21) + seed); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
	// seeds: whole patches with v = 1, or the pattern dies before it starts
	vec2 c = floor(uv * n / 7.);
	float v = h(c) > .93 ? 1. : 0.;
	o = vec4(1. - v, v, 0., 1.);
}`;
const RD_STEP = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D state, mask;
uniform float n, F, K;
uniform vec2 mk;
void main() {
	vec2 e = vec2(1. / n, 0.);
	vec2 c = texture(state, uv).rg;
	vec2 lap = -c
		+ .2 * (texture(state, uv + e.xy).rg + texture(state, uv - e.xy).rg + texture(state, uv + e.yx).rg + texture(state, uv - e.yx).rg)
		+ .05 * (texture(state, uv + vec2(e.x, e.x)).rg + texture(state, uv - vec2(e.x, e.x)).rg + texture(state, uv + vec2(e.x, -e.x)).rg + texture(state, uv - vec2(e.x, -e.x)).rg);
	float u = c.r, v = c.g, r = u * v * v;
	u += 1.0 * lap.r - r + F * (1. - u);
	v += .5 * lap.g + r - (F + K) * v;
	if (texture(mask, uv * mk.x + mk.y).r < .5) { u = 1.; v = 0.; }
	o = vec4(clamp(u, 0., 1.), clamp(v, 0., 1.), 0., 1.);
}`;
const RD_OUT = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D state, mask;
uniform vec2 mk;
void main() {
	vec2 q = vec2(uv.x, 1. - uv.y);
	float v = texture(state, q).g * smoothstep(.35, .65, texture(mask, q * mk.x + mk.y).r);
	float a = smoothstep(.16, .26, v);
	o = vec4(1., 1., 1., a);
}`;
export const CORAL = { coral: [0.0545, 0.062], spots: [0.0367, 0.0649], maze: [0.029, 0.057], holes: [0.039, 0.058], worms: [0.078, 0.061] };

function hex(c) {
	const v = parseInt(c.replace('#', ''), 16);
	return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export class Ink {
	constructor() {
		this.canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
		const gl = this.gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
		if (!gl) throw new Error('WebGL2 unavailable');
		const prog = (fs) => {
			const p = gl.createProgram();
			for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
				const s = gl.createShader(type);
				gl.shaderSource(s, src); gl.compileShader(s);
				if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
				gl.attachShader(p, s);
			}
			gl.bindAttribLocation(p, 0, 'p');
			gl.linkProgram(p);
			if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
			const u = {};
			const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
			for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
			return { p, u };
		};
		this.blur = prog(BLUR);
		this.final = prog(FINAL);
		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		this.src = this.tex();
		this.fb = [this.target(), this.target()];
		this.size = 0;
		this.prog = prog;
	}
	// grow a reaction–diffusion pattern where spec.mask allows; returns a 2D canvas whose alpha is the ink
	// the coral, all at once
	coral(spec, size, quality = 1) {
		const run = this.coralSetup(spec, quality);
		if (!run) return null;
		this.coralSteps(run, 0, run.steps);
		return this.coralOut(run, size);
	}
	// the same, a few hundred passes at a time, each batch finished on the GPU before the next is
	// queued: over a thousand passes in one go hold up the page's own frames (and its ink) for a tenth
	// of a second; this way they fit between them. The passes are the same, so is the coral.
	async coralAsync(spec, size, quality = 1) {
		const gl = this.gl, run = this.coralSetup(spec, quality);
		if (!run) return null;
		// two batches queued at most: the next goes in before waiting on the last, so the GPU never
		// idles while the worker checks; each aims for about 6 ms of GPU time
		const done = sync => gl.clientWaitSync(sync, 0, 0) !== gl.TIMEOUT_EXPIRED;
		let i = 0, batch = 48, last = null, t = performance.now();
		while (i < run.steps) {
			const n = Math.min(batch, run.steps - i);
			this.coralSteps(run, i, i + n);
			i += n;
			const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
			gl.flush();
			if (last) {
				while (!done(last.sync)) await new Promise(r => setTimeout(r, 0));
				gl.deleteSync(last.sync);
				const now = performance.now(), ms = Math.max(0.5, now - t);
				t = now;
				batch = Math.max(8, Math.min(600, Math.round(last.n * Math.min(2, Math.max(0.5, 6 / ms)))));
			}
			last = { sync, n };
		}
		while (!done(last.sync)) await new Promise(r => setTimeout(r, 0));
		gl.deleteSync(last.sync);
		return this.coralOut(run, size);
	}
	coralSetup(spec, quality) {
		const gl = this.gl;
		if (!this.rd) {
			if (!gl.getExtension('EXT_color_buffer_float')) return null;
			// full floats: half floats can't hold the tiny per-step changes near u = 1
			const lin = !!gl.getExtension('OES_texture_float_linear');
			this.rd = { init: this.prog(RD_INIT), step: this.prog(RD_STEP), out: this.prog(RD_OUT), fb: [this.target(), this.target()], maskTex: this.tex(), n: 0, lin };
		}
		const rd = this.rd;
		const n = Math.round(clamp(1000 / (spec.scale / 8), 96, 760));
		if (rd.n !== n) {
			for (const t of rd.fb) {
				gl.bindTexture(gl.TEXTURE_2D, t.t);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, n, 0, gl.RGBA, gl.FLOAT, null);
				const f = rd.lin ? gl.LINEAR : gl.NEAREST;
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
				gl.bindFramebuffer(gl.FRAMEBUFFER, t.f);
				gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.t, 0);
			}
			rd.n = n;
		}
		gl.bindTexture(gl.TEXTURE_2D, rd.maskTex);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, spec.nx, spec.ny, 0, gl.RED, gl.UNSIGNED_BYTE, spec.mask);
		const [F, K] = CORAL[spec.style] || CORAL.coral;
		gl.viewport(0, 0, n, n);
		gl.useProgram(rd.init.p);
		gl.uniform1f(rd.init.u.seed, (spec.seed % 997) * 0.013);
		gl.uniform1f(rd.init.u.n, n);
		gl.bindFramebuffer(gl.FRAMEBUFFER, rd.fb[0].f);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.useProgram(rd.step.p);
		gl.uniform1i(rd.step.u.state, 0); gl.uniform1i(rd.step.u.mask, 1);
		gl.uniform1f(rd.step.u.n, n); gl.uniform1f(rd.step.u.F, F); gl.uniform1f(rd.step.u.K, K);
		const mk = [1000 / (spec.cell * spec.nx), 0.5 / spec.nx];
		gl.uniform2fv(rd.step.u.mk, mk);
		gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rd.maskTex);
		gl.activeTexture(gl.TEXTURE0);
		const steps = quality > 0.8 ? 2400 : 1400;
		return { rd, steps, mk };
	}
	coralSteps({ rd }, from, to) {
		const gl = this.gl;
		for (let i = from; i < to; i++) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, rd.fb[(i + 1) % 2].f);
			gl.bindTexture(gl.TEXTURE_2D, rd.fb[i % 2].t);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}
	}
	coralOut({ rd, steps, mk }, size) {
		const gl = this.gl;
		// out at the requested size; the grid's y runs down like the mask, so no flip
		if (!(this.w >= size && this.h >= size)) this.resize(Math.max(this.w || 0, size), Math.max(this.h || 0, size));
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, size, size);
		gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(rd.out.p);
		gl.uniform1i(rd.out.u.state, 0); gl.uniform1i(rd.out.u.mask, 1);
		gl.uniform2fv(rd.out.u.mk, mk);
		gl.bindTexture(gl.TEXTURE_2D, rd.fb[steps % 2].t);
		gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rd.maskTex);
		gl.activeTexture(gl.TEXTURE0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
		// the GL canvas may be bigger than size; its bottom-left size×size is what we drew
		c.getContext('2d').drawImage(this.canvas, 0, this.canvas.height - size, size, size, 0, 0, size, size);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		return c;
	}
	tex() {
		const gl = this.gl, t = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, t);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return t;
	}
	target() { const gl = this.gl; return { t: this.tex(), f: gl.createFramebuffer() }; }
	resize(w, h = w) {
		if (w === this.w && h === this.h) return;
		const gl = this.gl;
		this.w = w; this.h = h; this.size = Math.max(w, h);
		this.canvas.width = w; this.canvas.height = h;
		for (const fb of this.fb) {
			gl.bindTexture(gl.TEXTURE_2D, fb.t);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, fb.f);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fb.t, 0);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}
	// coverage: canvas; P: params; out: 2D context to draw the result into (same size)
	// view: { zoom, panUp, panDn } pins the print's grain and roughness to a page the camera moves over
	render(coverage, P, seed = 0, view = null, clear = false) {
		const zoom = view ? view.zoom : 1, panUp = view ? view.panUp : [0, 0], panDn = view ? view.panDn : [0, 0];
		// the 1000-unit square spans the height; a wide coverage canvas just extends sideways
		const gl = this.gl, w = coverage.width, h = coverage.height, size = h;
		this.resize(w, h);
		gl.viewport(0, 0, w, h);
		gl.bindTexture(gl.TEXTURE_2D, this.src);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, coverage);
		const k = size / 1000;
		const radius = P.bleed * k * zoom;
		const s = (seed % 1000) * 0.137;
		// pass 1: displace + horizontal blur
		const b = this.blur;
		gl.useProgram(b.p);
		gl.uniform1i(b.u.src, 0);
		gl.uniform1f(b.u.radius, radius);
		gl.uniform1f(b.u.rough, P.rough * 6);
		gl.uniform1f(b.u.roughScale, P.roughScale);
		gl.uniform1f(b.u.seed, s);
		gl.uniform2f(b.u.res, w, h);
		gl.uniform2f(b.u.asp, w / h, 1);
		gl.uniform1f(b.u.zoom, zoom);
		gl.uniform2fv(b.u.panUp, panUp);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb[0].f);
		gl.bindTexture(gl.TEXTURE_2D, this.src);
		gl.uniform2f(b.u.dir, 1, 0);
		gl.uniform1i(b.u.displace, 1);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		// pass 2: vertical blur
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb[1].f);
		gl.bindTexture(gl.TEXTURE_2D, this.fb[0].t);
		gl.uniform2f(b.u.dir, 0, 1);
		gl.uniform1i(b.u.displace, 0);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		// final
		const f = this.final;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.useProgram(f.p);
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.src);
		gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fb[1].t);
		gl.uniform1i(f.u.sharp, 0); gl.uniform1i(f.u.soft, 1);
		gl.uniform3fv(f.u.paper, hex(P.paper));
		gl.uniform3fv(f.u.inkA, hex(P.inkA));
		gl.uniform3fv(f.u.inkB, hex(P.inkB));
		gl.uniform3fv(f.u.inkC, hex(P.inkC || '#c9a227'));
		gl.uniform1f(f.u.bleed, P.bleed);
		gl.uniform1f(f.u.spread, P.spread);
		gl.uniform1f(f.u.edge, P.edge);
		gl.uniform1f(f.u.edgeScale, P.edgeScale);
		gl.uniform1f(f.u.speckle, P.speckle);
		gl.uniform1f(f.u.dirt, P.dirt);
		gl.uniform1f(f.u.mottle, P.mottle);
		gl.uniform1f(f.u.grain, P.grain);
		gl.uniform1f(f.u.seed, s);
		gl.uniform2f(f.u.asp, w / h, 1);
		gl.uniform1f(f.u.zoom, zoom);
		gl.uniform1i(f.u.clear, clear ? 1 : 0);
		gl.uniform2fv(f.u.panUp, panUp);
		gl.uniform2fv(f.u.panDn, panDn);
		gl.uniform1f(f.u.rough, P.rough * 6);
		gl.uniform1f(f.u.roughScale, P.roughScale);
		const ra = (P.misregAngle || 30) * Math.PI / 180, mr = P.misreg;
		gl.uniform2f(f.u.regA, 0, 0);
		gl.uniform2f(f.u.regB, Math.cos(ra) * mr, Math.sin(ra) * mr);
		gl.uniform2f(f.u.regC, -Math.sin(ra) * mr, Math.cos(ra) * mr);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.activeTexture(gl.TEXTURE0);
		return this.canvas;
	}
}
