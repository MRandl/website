/* The banner, live: an IVF index answering a query that follows the cursor.
   No dependencies. Where this does not run, ivf.svg stays in place.

   Drawn by the graphics card, with WebGL, on one opaque canvas at the screen's
   own resolution, which the browser can show as it is. The shapes are sent
   to the card once; at each frame only the colors of the cells and of their
   points go, and the query. The canvas never moves: a page where only canvas
   pixels change spares the browser its layout and paint. Nothing runs while
   nothing changes, or while the banner is out of sight. */
(function () {
"use strict";

const img = document.querySelector("img.map");
if (!img || !window.PointerEvent || !window.Float32Array) return;

const HEIGHT = 380;             // banner height in our units; x = 0 is the middle
const CELL_W = 92, CELL_H = 80; // average cell
const PROBES = 4, K = 16;       // cells searched, neighbors returned
const PACE = 112;               // speed of the stroll, units per second
// Showing a frame costs the browser more than drawing it, so there are only 40
// per second
const FRAME_MS = 1000 / 40;
const FADE = .09;               // seconds, for cells to change color

const rgb = h => [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
const RAMP = ["fff0a3", "d3e78f", "8fd19a", "46b5a4", "2290a5", "1d6793",
              "1a4675", "152f55", "101f3d"].map(rgb);
const STOPS = [-60, 20, 130, 250, 380, 520, 670, 820, 900];
const PROBED = rgb("ffe14d");
const DOT_PROBED = rgb("101f3d"), DOT_ON_DARK = rgb("a9d3d6"), DOT_ON_LIGHT = rgb("2a6468");

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* color by distance to the query, tabulated; distances are stretched so that
   the palette spans the banner, whatever its width */
const COLORS = [];
for (let d = 0, i = 1; d <= STOPS[STOPS.length - 1]; d++) {
    while (d > STOPS[i]) i++;
    const t = (d - STOPS[i - 1]) / (STOPS[i] - STOPS[i - 1]);
    COLORS.push(RAMP[i].map((v, k) => RAMP[i - 1][k] + t * (v - RAMP[i - 1][k])));
}

/* ---- the index ---- */

let cells, span = 0;            // span: width the index covers

function uniform(a, b) { return a + Math.random() * (b - a); }
function normal() {
    return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/* nearest cell of p, and by how much it beats the runner-up */
function assign(p) {
    let best = null, d1 = Infinity, d2 = Infinity;
    for (const c of cells) {
        const d = dist(p, c);
        if (d < d1) { d2 = d1; d1 = d; best = c; }
        else if (d < d2) d2 = d;
    }
    return { cell: best, margin: d2 - d1 };
}

/* Voronoi cell of c: a box cut by the bisector with every other centroid,
   nearest first, until they are too far to matter */
function voronoi(c) {
    const x = span / 2 + 8, y0 = -8, y1 = HEIGHT + 8;
    let poly = [{ x: -x, y: y0 }, { x: x, y: y0 }, { x: x, y: y1 }, { x: -x, y: y1 }];
    const others = cells.filter(o => o !== c).sort((a, b) => dist(a, c) - dist(b, c));
    for (const o of others) {
        if (!poly.length || dist(o, c) > 2 * Math.max(...poly.map(p => dist(p, c)))) break;
        const nx = o.x - c.x, ny = o.y - c.y;
        const off = (nx * (c.x + o.x) + ny * (c.y + o.y)) / 2;
        const side = poly.map(p => nx * p.x + ny * p.y - off);
        const cut = [];
        poly.forEach((p, i) => {
            const j = (i + 1) % poly.length, a = side[i], b = side[j];
            if (a <= 0) cut.push(p);
            if ((a <= 0) !== (b <= 0)) {
                const t = a / (a - b);
                cut.push({ x: p.x + t * (poly[j].x - p.x), y: p.y + t * (poly[j].y - p.y) });
            }
        });
        poly = cut;
    }
    return poly;
}

function build(width) {
    span = width;
    cells = [];
    const cols = Math.ceil(width / CELL_W / 2) + 2;
    for (let r = -1; r < 7; r++)
        for (let c = -cols; c <= cols; c++)
            cells.push({ x: (c + (r & 1) / 2 + uniform(-.36, .36)) * CELL_W,
                         y: (r + .2 + uniform(-.34, .34)) * CELL_H });

    let points = [];
    for (const c of cells)
        for (let n = Math.floor(uniform(11, 18)); n > 0; n--)
            points.push({ x: c.x + normal() * .27 * CELL_W, y: c.y + normal() * .27 * CELL_W });

    // a little k-means, as a real index would do
    for (let round = 0; round < 3; round++) {
        for (const c of cells) c.sx = c.sy = c.n = 0;
        for (const p of points) {
            const c = assign(p).cell;
            c.sx += p.x; c.sy += p.y; c.n++;
        }
        for (const c of cells) if (c.n) { c.x = c.sx / c.n; c.y = c.sy / c.n; }
    }

    // keep the points that are legible: off the borders and off each other
    for (const c of cells) c.points = [];
    for (const p of points) {
        const a = assign(p);
        if (a.margin > 7 && a.cell.points.every(o => dist(o, p) > 6)) a.cell.points.push(p);
    }

    for (const c of cells) {
        const poly = voronoi(c);
        c.visible = poly.length > 2;
        c.poly = poly;
        c.left = Math.min(...poly.map(p => p.x));
        c.right = Math.max(...poly.map(p => p.x));
        c.top = Math.min(...poly.map(p => p.y));
        c.bottom = Math.max(...poly.map(p => p.y));
        c.look = null;          // colors of the cell and its dots, size of these
        c.painted = null;       // the look on screen
        c.hot = false;
    }
}

/* ---- the canvas ---- */

const box = document.createElement("div");
const canvas = box.appendChild(document.createElement("canvas"));
canvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";
const OPTIONS = { alpha: false, antialias: false, depth: false, stencil: false,
                  premultipliedAlpha: false, powerPreference: "low-power" };
const gl = canvas.getContext && (canvas.getContext("webgl", OPTIONS)
                                 || canvas.getContext("experimental-webgl", OPTIONS));
if (!gl) return;

/* Two programs. One fills the cells, whose edges the borders hide. The other
   draws everything else as capsules: a segment and a radius, so a border, a
   line, or with both ends together a dot or a disc; the shader measures each
   pixel's distance to the segment, which gives smooth edges. */
const UNITS = `
    uniform vec2 u_k;           // clip space per unit
    vec4 place(vec2 p) { return vec4(p.x * u_k.x, 1.0 - p.y * u_k.y, 0.0, 1.0); }`;
const FILL = [`${UNITS}
    attribute vec2 a_pos;
    attribute vec4 a_color;
    varying vec4 v_color;
    void main() { v_color = a_color; gl_Position = place(a_pos); }`, `
    precision mediump float;
    varying vec4 v_color;
    void main() { gl_FragColor = v_color; }`];
const CAPSULE = [`${UNITS}
    uniform mediump float u_px; // units per pixel
    attribute vec4 a_seg;       // from xy to zw
    attribute vec2 a_corner;    // of the quad around it, 0 or 1 each
    attribute vec4 a_paint;
    attribute float a_radius;
    varying vec2 v_q, v_d;      // relative to the start, so mediump will do
    varying float v_r;
    varying vec4 v_paint;
    void main() {
        vec2 d = a_seg.zw - a_seg.xy;
        float l = length(d);
        vec2 u = l > 0.0 ? d / l : vec2(1.0, 0.0), n = vec2(-u.y, u.x);
        float e = a_radius + u_px;
        vec2 p = (a_corner.x < 0.5 ? a_seg.xy - u * e : a_seg.zw + u * e)
               + n * e * (2.0 * a_corner.y - 1.0);
        v_q = p - a_seg.xy; v_d = d; v_r = a_radius; v_paint = a_paint;
        gl_Position = place(p);
    }`, `
    precision mediump float;
    uniform mediump float u_px;
    varying vec2 v_q, v_d;
    varying float v_r;
    varying vec4 v_paint;
    void main() {
        float h = clamp(dot(v_q, v_d) / max(dot(v_d, v_d), 1e-6), 0.0, 1.0);
        float cover = clamp((v_r - length(v_q - v_d * h)) / u_px + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(v_paint.rgb, v_paint.a * cover);
    }`];

let flat, capsule;              // the programs, with their attributes and uniforms
let cellPos, cellColor, wallSeg, dotSeg, dotStyle, querySeg; // the buffers

function program(source) {
    const p = gl.createProgram();
    source.forEach((text, i) => {
        const sh = gl.createShader(i ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER);
        gl.shaderSource(sh, text);
        gl.compileShader(sh);
        gl.attachShader(p, sh);
    });
    gl.linkProgram(p);
    const where = { p };
    for (let i = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i--;) {
        const name = gl.getActiveAttrib(p, i).name;
        where[name] = gl.getAttribLocation(p, name);
    }
    for (let i = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i--;) {
        const name = gl.getActiveUniform(p, i).name;
        where[name] = gl.getUniformLocation(p, name);
    }
    return where;
}

function setup() {
    flat = program(FILL);
    capsule = program(CAPSULE);
    [cellPos, cellColor, wallSeg, dotSeg, dotStyle, querySeg] = [1, 2, 3, 4, 5, 6].map(() => gl.createBuffer());
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return gl.getProgramParameter(flat.p, gl.LINK_STATUS)
        && gl.getProgramParameter(capsule.p, gl.LINK_STATUS);
}
if (!setup()) return;

/* the quad around a capsule is two triangles, six corners */
const CORNERS = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];

/* writes the six corners of the segment a-b at vertex i of data, each with
   the extra values given; returns the next vertex */
function quad(data, i, stride, a, b, extra) {
    for (let k = 0; k < 6; k++, i++) {
        const o = i * stride;
        data[o] = a.x; data[o + 1] = a.y; data[o + 2] = b.x; data[o + 3] = b.y;
        data[o + 4] = CORNERS[2 * k]; data[o + 5] = CORNERS[2 * k + 1];
        for (let e = 0; e < extra.length; e++) data[o + 6 + e] = extra[e];
    }
    return i;
}

function upload(buffer, data, usage) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
}

let width = 0, height = 0, ratio = 1; // of the banner, in CSS pixels
let scale = 1, zoom = 1;              // CSS and device pixels per unit
let tint = 1;                         // that stretch
let shown = [];                       // cells on screen
let cellColors, dotStyles;            // what changes from frame to frame
let triangles = 0, walls = 0, spots = 0; // vertex counts
let drawn = false;                    // is the canvas up to date?
let stale = true;                     // has the size possibly changed?

function fit() {
    stale = false;
    const w = box.clientWidth, h = box.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === width && h === height && dpr === ratio || !w || !h) return;
    width = w; height = h; ratio = dpr;
    scale = height / HEIGHT; zoom = scale * ratio;
    reach = .42 * width / scale;
    tint = COLORS.length / (width / scale / 2);
    if (width / scale > span) build(Math.max(width, screen.width) / scale);
    const half = width / scale / 2;
    shown = cells.filter(c => c.visible && c.right > -half && c.left < half);
    for (const c of cells) c.painted = null;

    // the cells, as fans of triangles
    triangles = 0;
    for (const c of shown) { c.first = triangles; triangles += 3 * (c.poly.length - 2); }
    const pos = new Float32Array(2 * triangles);
    cellColors = new Uint8Array(4 * triangles);
    for (const c of shown) {
        let i = 2 * c.first;
        for (let k = 1; k + 1 < c.poly.length; k++)
            for (const p of [c.poly[0], c.poly[k], c.poly[k + 1]]) { pos[i++] = p.x; pos[i++] = p.y; }
    }
    upload(cellPos, pos, gl.STATIC_DRAW);

    // the borders, each edge once
    const edges = new Map(), key = p => Math.round(p.x * 64) + "," + Math.round(p.y * 64);
    for (const c of shown)
        c.poly.forEach((a, k) => {
            const b = c.poly[(k + 1) % c.poly.length], ka = key(a), kb = key(b);
            edges.set(ka < kb ? ka + " " + kb : kb + " " + ka, [a, b]);
        });
    walls = 6 * edges.size;
    const seg = new Float32Array(6 * walls);
    let i = 0;
    for (const [a, b] of edges.values()) i = quad(seg, i, 6, a, b, []);
    upload(wallSeg, seg, gl.STATIC_DRAW);

    // the points: where they are does not change, how they look does
    spots = 0;
    for (const c of shown) { c.firstDot = spots; spots += 6 * c.points.length; }
    const dots = new Float32Array(6 * spots);
    i = 0;
    for (const c of shown) for (const p of c.points) i = quad(dots, i, 6, p, p, []);
    upload(dotSeg, dots, gl.STATIC_DRAW);
    dotStyles = new Float32Array(4 * spots);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    gl.viewport(0, 0, canvas.width, canvas.height);
    for (const prog of [flat, capsule]) {
        gl.useProgram(prog.p);
        gl.uniform2f(prog.u_k, 2 * scale / width, 2 * scale / height);
    }
    gl.uniform1f(capsule.u_px, 1 / zoom);
    drawn = false;
}

/* ---- the query ---- */

const motion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
const calm = () => motion && motion.matches;
const query = { x: 0, y: HEIGHT / 2 };
let cursor = null;              // where the cursor is, if over the banner
let phase = 0;                  // of the stroll
let reach = 1;                  // how far the stroll goes from the middle
let lagX = 0, lagY = 0, ease = .1; // query - target, fading after a change of target

const targetX = () => cursor ? cursor.x : reach * Math.sin(phase);
const targetY = () => cursor ? cursor.y : HEIGHT / 2;

function retarget(seconds) {
    lagX = query.x - targetX();
    lagY = query.y - targetY();
    ease = seconds;
    wake();
}

function follow(e) {
    const b = box.getBoundingClientRect(), entered = !cursor;
    cursor = { x: (e.clientX - b.left - width / 2) / scale, y: (e.clientY - b.top) / scale };
    if (entered) retarget(.07);
    else wake();
}

function release() {
    if (!cursor) return;
    cursor = null;              // stroll on from here, in the same direction
    const a = Math.asin(Math.max(-1, Math.min(1, query.x / reach)));
    phase = calm() ? 0 : Math.cos(phase) < 0 ? Math.PI - a : a;
    retarget(.35);
}

/* the cells nearest to the query, and in them the points nearest to it */
let probed = [], near = [];

function insert(list, item, size) {
    let i = list.length;
    if (i === size && list[i - 1].d <= item.d) return;
    if (i < size) list.push(item); else i--;
    for (; i && list[i - 1].d > item.d; i--) list[i] = list[i - 1];
    list[i] = item;
}

function search() {
    for (const c of probed) c.hot = false;
    probed = []; near = [];
    for (const c of cells) { c.d = dist(c, query); insert(probed, c, PROBES); }
    for (const c of probed) {
        c.hot = true;
        for (const p of c.points) { p.d = dist(p, query); insert(near, p, K); }
    }
}

/* ---- painting ---- */

/* moves the colors along; true while some are still on their way, and
   sets changed when one has moved by at least a step */
let changed = false;
function fadeCells(dt) {
    const blend = 1 - Math.exp(-dt / FADE);
    let busy = false;
    for (const c of shown) {
        const fill = c.hot ? PROBED : COLORS[Math.min(COLORS.length - 1, Math.round(c.d * tint))];
        const dots = c.hot ? DOT_PROBED
            : fill[0] + fill[1] + fill[2] < 450 ? DOT_ON_DARK : DOT_ON_LIGHT;
        const size = c.hot ? 58 : 42; // in tenths, to round like the colors
        if (!c.look) c.look = [...fill, ...dots, size];
        const look = c.look;
        if (!c.painted) { c.painted = []; changed = true; }
        for (let k = 0; k < 7; k++) {
            const goal = k < 3 ? fill[k] : k < 6 ? dots[k - 3] : size;
            look[k] += blend * (goal - look[k]);
            if (Math.abs(goal - look[k]) < .5) look[k] = goal;
            else busy = true;
            const v = Math.round(look[k]);
            if (c.painted[k] !== v) { c.painted[k] = v; changed = true; }
        }
    }
    return busy;
}

/* binds a buffer of floats to attributes: [name, size] in order, all floats */
function bind(prog, buffer, layout) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = 4 * layout.reduce((n, [, size]) => n + size, 0);
    let offset = 0;
    for (const [name, size] of layout) {
        gl.enableVertexAttribArray(prog[name]);
        gl.vertexAttribPointer(prog[name], size, gl.FLOAT, false, stride, offset);
        offset += 4 * size;
    }
}

/* the same value for every vertex */
function constant(prog, name, ...v) {
    gl.disableVertexAttribArray(prog[name]);
    gl["vertexAttrib" + v.length + "f"](prog[name], ...v);
}

/* the whole banner, at once */
function paint() {
    for (const c of shown) {
        const v = c.painted;
        for (let i = 4 * c.first, end = i + 12 * (c.poly.length - 2); i < end; i += 4) {
            cellColors[i] = v[0]; cellColors[i + 1] = v[1]; cellColors[i + 2] = v[2]; cellColors[i + 3] = 255;
        }
        const r = v[3] / 255, g = v[4] / 255, b = v[5] / 255, radius = v[6] / 20;
        for (let i = 4 * c.firstDot, end = i + 24 * c.points.length; i < end; i += 4) {
            dotStyles[i] = r; dotStyles[i + 1] = g; dotStyles[i + 2] = b; dotStyles[i + 3] = radius;
        }
    }

    gl.useProgram(flat.p);
    bind(flat, cellPos, [["a_pos", 2]]);
    upload(cellColor, cellColors, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(flat.a_color);
    gl.vertexAttribPointer(flat.a_color, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, triangles);
    gl.disableVertexAttribArray(flat.a_pos);
    gl.disableVertexAttribArray(flat.a_color);

    gl.useProgram(capsule.p);
    bind(capsule, dotSeg, [["a_seg", 4], ["a_corner", 2]]);
    upload(dotStyle, dotStyles, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(capsule.a_paint);
    gl.vertexAttribPointer(capsule.a_paint, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(capsule.a_radius);
    gl.vertexAttribPointer(capsule.a_radius, 1, gl.FLOAT, false, 16, 12);
    gl.drawArrays(gl.TRIANGLES, 0, spots);

    bind(capsule, wallSeg, [["a_seg", 4], ["a_corner", 2]]);
    constant(capsule, "a_paint", 1, 1, 1, 1);
    constant(capsule, "a_radius", .65);
    gl.drawArrays(gl.TRIANGLES, 0, walls);

    const n = paintQuery();
    bind(capsule, querySeg, [["a_seg", 4], ["a_corner", 2], ["a_paint", 4], ["a_radius", 1]]);
    gl.drawArrays(gl.TRIANGLES, 0, n);
    for (const name of ["a_seg", "a_corner", "a_paint", "a_radius"])
        gl.disableVertexAttribArray(capsule[name]);
    drawn = true;
}

const RED = [229 / 255, 56 / 255, 42 / 255, 1], WHITE = [1, 1, 1, 1];
const SHADE = [0, 0, 0, .27];
let queryData = new Float32Array(0);

/* the query and its neighbors, as capsules; returns their vertex count */
function paintQuery() {
    const r = near.length ? near[near.length - 1].d : 0;
    const parts = [];
    const add = (a, b, radius, paint) => parts.push([a, b, [...paint, radius]]);
    if (near.length) {          // radius of the K-th neighbor, dashed
        for (let k = 0; k < 52; k++) {
            const t0 = 2 * Math.PI * k / 52, t1 = t0 + 2 * Math.PI * .58 / 52;
            add({ x: query.x + r * Math.cos(t0), y: query.y + r * Math.sin(t0) },
                { x: query.x + r * Math.cos(t1), y: query.y + r * Math.sin(t1) }, .55, SHADE);
        }
    }
    for (const p of near) add(query, p, .8, RED);
    for (const p of near) { add(p, p, 4.6, WHITE); add(p, p, 3.5, RED); }
    add(query, query, 9.5, WHITE);
    add(query, query, 7.8, RED);
    add(query, query, 3, WHITE);
    if (queryData.length < 66 * parts.length) queryData = new Float32Array(66 * parts.length);
    let i = 0;
    for (const [a, b, extra] of parts) i = quad(queryData, i, 11, a, b, extra);
    upload(querySeg, queryData.subarray(0, 11 * i), gl.DYNAMIC_DRAW);
    return i;
}

/* ---- the loop ---- */

let running = false, last = -FRAME_MS, due = 0;

function wake() {
    if (running) return;
    running = true;
    last = Math.max(last, performance.now() - FRAME_MS);
    next();
}

/* frames keep to a schedule, so that rounding to the screen's refreshes does
   not add up; the timer is a little early, not to miss one */
function next() {
    const now = performance.now();
    due = Math.max(due + FRAME_MS, now);
    setTimeout(requestAnimationFrame, due - now - 4, frame);
}

function frame(now) {
    if (stale) fit();
    if (!width || window.pageYOffset >= height) { // the page covers the banner
        running = false;
        return;
    }
    const dt = Math.max(0, Math.min(.1, (now - last) / 1000));
    last = now;
    const strolling = !cursor && !calm();
    if (strolling) phase = (phase + dt * PACE / reach) % (2 * Math.PI);
    const fade = Math.exp(-dt / ease);
    lagX *= fade; lagY *= fade;
    if (Math.abs(lagX) + Math.abs(lagY) < .1) lagX = lagY = 0;
    const x = targetX() + lagX, y = targetY() + lagY;
    const moved = x !== query.x || y !== query.y;
    if (moved || !drawn) {
        query.x = x; query.y = y;
        search();
    }
    const busy = fadeCells(dt);
    if (changed || moved || !drawn) paint();
    changed = false;
    if (!strolling && !moved && !busy) running = false; // until something happens
    else next();
}

canvas.addEventListener("webglcontextlost", e => e.preventDefault());
canvas.addEventListener("webglcontextrestored", () => {
    if (!setup()) return;
    width = 0; stale = true; wake();
});

box.className = img.className;
box.setAttribute("aria-hidden", "true");
box.style.cssText = "position:relative;overflow:hidden;cursor:none;"
    + "touch-action:pan-y"; // sideways drags steer, vertical ones scroll
img.parentNode.replaceChild(box, img);

for (const type of ["pointerenter", "pointerdown", "pointermove"]) box.addEventListener(type, follow);
for (const type of ["pointerleave", "pointercancel"]) box.addEventListener(type, release);
window.addEventListener("scroll", wake, { passive: true });
const remeasure = () => { stale = true; wake(); };
window.addEventListener("resize", remeasure);
if (window.ResizeObserver) new ResizeObserver(remeasure).observe(box);
if (motion && motion.addEventListener) motion.addEventListener("change", wake);
wake();
})();
