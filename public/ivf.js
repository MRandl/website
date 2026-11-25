/* The banner, live: an IVF index answering a query that follows the cursor.
   No dependencies. Where this does not run, ivf.svg stays in place.

   Three layers, so that little is painted: the cells, repainted one by one
   when their color has visibly changed; the borders, painted once; and the
   query with its neighbors. The layers never move: a page where only canvas
   pixels change spares the browser its layout and paint. Nothing runs while
   nothing changes, or while the banner is out of sight. */
(function () {
"use strict";

const img = document.querySelector("img.map");
if (!img || !window.Path2D || !window.PointerEvent) return;

const HEIGHT = 380;             // banner height in our units; x = 0 is the middle
const CELL_W = 92, CELL_H = 80; // average cell
const PROBES = 4, K = 16;       // cells searched, neighbors returned
const PACE = 45;                // speed of the stroll, units per second
// Showing a frame costs the browser more than drawing it, so there are only 40
// per second; during the stroll, the cells make do with every other one
const FRAME_MS = 1000 / 40;
const FADE = .09;               // seconds, for cells to change color
const STEP = 4;                 // color change (of 255) worth a repaint

const rgb = h => [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
const RAMP = ["fff0a3", "d3e78f", "8fd19a", "46b5a4", "2290a5", "1d6793",
              "1a4675", "152f55", "101f3d"].map(rgb);
const STOPS = [-60, 20, 130, 250, 380, 520, 670, 820, 900];
const PROBED = rgb("ffe14d");
const DOT_PROBED = "#101f3d", DOT_ON_DARK = "#a9d3d6", DOT_ON_LIGHT = "#2a6468";

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* color by distance to the query, tabulated */
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
        c.shape = new Path2D();
        poly.forEach((p, i) => c.shape[i ? "lineTo" : "moveTo"](p.x, p.y));
        c.shape.closePath();
        c.left = Math.min(...poly.map(p => p.x));
        c.right = Math.max(...poly.map(p => p.x));
        c.small = new Path2D();
        c.big = new Path2D();
        for (const p of c.points)
            for (const [path, r] of [[c.small, 2.1], [c.big, 2.9]]) {
                path.moveTo(p.x + r, p.y);
                path.arc(p.x, p.y, r, 0, 2 * Math.PI);
            }
        c.color = null;         // where its color is, on the way to its goal
        c.painted = null;       // the color on screen
        c.hot = c.wasHot = false;
    }
}

/* ---- the layers ---- */

const box = document.createElement("div");
const layer = opaque => {
    const canvas = box.appendChild(document.createElement("canvas"));
    const g = canvas.getContext && canvas.getContext("2d", { alpha: !opaque });
    canvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none";
    return g;
};
const floor = layer(true), walls = layer(false), top = layer(false);
if (!floor || !walls || !top) return;

let width = 0, height = 0, ratio = 1; // of the banner, in CSS pixels
let scale = 1, zoom = 1;              // CSS and device pixels per unit
let shown = [];                       // cells on screen
let drawn = null;                     // where the top layer has been drawn on
let stale = true;                     // has the size possibly changed?

function resize(g, w, h) {
    g.canvas.width = w;
    g.canvas.height = h;
}

function fit() {
    stale = false;
    const w = box.clientWidth, h = box.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === width && h === height && dpr === ratio || !w || !h) return;
    width = w; height = h; ratio = dpr;
    scale = height / HEIGHT; zoom = scale * ratio;
    reach = .42 * width / scale;
    if (width / scale > span) build(Math.max(width, screen.width) / scale);
    const half = width / scale / 2;
    shown = cells.filter(c => c.visible && c.right > -half && c.left < half);
    for (const c of cells) c.painted = null;
    for (const g of [floor, walls, top]) {
        resize(g, Math.round(width * ratio), Math.round(height * ratio));
        g.setTransform(zoom, 0, 0, zoom, g.canvas.width / 2, 0);
    }
    walls.strokeStyle = "#fff"; walls.lineWidth = 1.3; walls.lineJoin = "round";
    const borders = new Path2D();
    for (const c of shown) borders.addPath(c.shape);
    walls.stroke(borders);
    drawn = null;
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

/* moves the colors along; true while some are still on their way */
function paintCells(dt) {
    const blend = 1 - Math.exp(-dt / FADE);
    let busy = false;
    for (const c of shown) {
        const goal = c.hot ? PROBED : COLORS[Math.min(COLORS.length - 1, Math.round(c.d))];
        if (!c.color) c.color = goal.slice();
        let far = 0, off = 0;
        for (let k = 0; k < 3; k++) {
            c.color[k] += blend * (goal[k] - c.color[k]);
            far = Math.max(far, Math.abs(goal[k] - c.color[k]));
            if (c.painted) off = Math.max(off, Math.abs(c.painted[k] - c.color[k]));
        }
        if (far < 1) for (let k = 0; k < 3; k++) c.color[k] = goal[k];
        else busy = true;
        if (c.painted && off < STEP && c.hot === c.wasHot) continue;
        c.painted = c.painted || [];
        for (let k = 0; k < 3; k++) c.painted[k] = Math.round(c.color[k]);
        c.wasHot = c.hot;
        floor.fillStyle = "rgb(" + c.painted + ")";
        floor.fill(c.shape);
        floor.fillStyle = c.hot ? DOT_PROBED
            : c.painted[0] + c.painted[1] + c.painted[2] < 450 ? DOT_ON_DARK : DOT_ON_LIGHT;
        floor.fill(c.hot ? c.big : c.small);
    }
    return busy;
}

function disc(p, r) {
    top.beginPath();
    top.arc(p.x, p.y, r, 0, 2 * Math.PI);
}

function paintQuery() {
    const r = near.length ? near[near.length - 1].d : 0;
    if (drawn) top.clearRect(drawn.x - drawn.r, drawn.y - drawn.r, 2 * drawn.r, 2 * drawn.r);
    drawn = { x: query.x, y: query.y, r: r + 12 };

    if (near.length) {          // radius of the K-th neighbor
        const dash = 2 * Math.PI * r / 52;
        top.strokeStyle = "rgba(0,0,0,.27)"; top.lineWidth = 1.1;
        top.setLineDash([.58 * dash, .42 * dash]);
        disc(query, r); top.stroke();
        top.setLineDash([]);
    }
    top.strokeStyle = "#e5382a"; top.lineWidth = 1.6;
    top.beginPath();
    for (const p of near) { top.moveTo(query.x, query.y); top.lineTo(p.x, p.y); }
    top.stroke();
    top.strokeStyle = "#fff"; top.lineWidth = 1.1; top.fillStyle = "#e5382a";
    for (const p of near) { disc(p, 4.05); top.fill(); top.stroke(); }
    disc(query, 9.5); top.fillStyle = "#fff"; top.fill();
    disc(query, 7.8); top.fillStyle = "#e5382a"; top.fill();
    disc(query, 3); top.fillStyle = "#fff"; top.fill();
}

/* ---- the loop ---- */

let running = false, last = -FRAME_MS, lastCells = 0, due = 0;

function wake() {
    if (running) return;
    running = true;
    last = lastCells = Math.max(last, performance.now() - FRAME_MS);
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
        paintQuery();
    }
    let busy = true;
    const rest = strolling && !lagX && !lagY ? 1.5 * FRAME_MS : 0;
    if (now - lastCells >= rest || !shown[0].painted) {
        busy = paintCells(Math.max(0, Math.min(.2, (now - lastCells) / 1000)));
        lastCells = now;
    }
    if (!strolling && !moved && !busy) running = false; // until something happens
    else next();
}

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
