/* The banner, live: an IVF index answering a query that follows the cursor.
   No dependencies. Where this does not run, ivf.svg stays in place. */
(function () {
"use strict";

const img = document.querySelector("img.map");
const canvas = document.createElement("canvas");
const g = canvas.getContext && canvas.getContext("2d");
if (!img || !g || !window.Path2D || !window.PointerEvent) return;

const HEIGHT = 380;             // banner height in our units; x = 0 is the middle
const CELL_W = 92, CELL_H = 80; // average cell
const PROBES = 4, K = 16;       // cells searched, neighbors returned
const PACE = 55;                // speed of the stroll, units per second

const rgb = h => [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
const RAMP = ["fff0a3", "d3e78f", "8fd19a", "46b5a4", "2290a5", "1d6793",
              "1a4675", "152f55", "101f3d"].map(rgb);
const STOPS = [-60, 20, 130, 250, 380, 520, 670, 820, 900];
const PROBED = rgb("ffe14d");
const DOT_PROBED = rgb("101f3d"), DOT_ON_DARK = rgb("a9d3d6"), DOT_ON_LIGHT = rgb("2a6468");

const css = c => "rgb(" + c.map(Math.round).join(",") + ")";
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function ramp(d) {
    let i = 1;
    while (i < STOPS.length - 1 && d > STOPS[i]) i++;
    const t = Math.min(1, (d - STOPS[i - 1]) / (STOPS[i] - STOPS[i - 1]));
    return RAMP[i].map((v, k) => RAMP[i - 1][k] + t * (v - RAMP[i - 1][k]));
}

/* ---- the index ---- */

let cells, borders, span = 0;   // span: width the index covers

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

    borders = new Path2D();
    for (const c of cells) {
        c.shape = new Path2D();
        c.dots = new Path2D();
        c.look = null;
        const poly = voronoi(c);
        c.visible = poly.length > 2;
        poly.forEach((p, i) => c.shape[i ? "lineTo" : "moveTo"](p.x, p.y));
        c.shape.closePath();
        if (c.visible) borders.addPath(c.shape);
        // dots are very short strokes with round caps, so their size can change
        for (const p of c.points) { c.dots.moveTo(p.x, p.y); c.dots.lineTo(p.x + .01, p.y); }
    }
}

/* ---- the query ---- */

const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
let query = { x: 0, y: HEIGHT / 2 };
let cursor = null;              // where the cursor is, if over the banner
let phase = 0;                  // of the stroll
let reach = 1;                  // how far the stroll goes from the middle
let lag = { x: 0, y: 0 }, ease = .1; // query - target, fading after a change of target

const target = () => cursor || { x: reach * Math.sin(phase), y: HEIGHT / 2 };

function retarget(change, seconds) {
    change();
    const t = target();
    lag = { x: query.x - t.x, y: query.y - t.y };
    ease = seconds;
}

function follow(e) {
    const box = canvas.getBoundingClientRect(), scale = box.height / HEIGHT;
    const p = { x: (e.clientX - box.left - box.width / 2) / scale,
                y: (e.clientY - box.top) / scale };
    if (cursor) cursor = p;
    else retarget(() => { cursor = p; }, .07);
    wake();
}

function release() {
    if (!cursor) return;
    retarget(() => {            // stroll on from here, in the same direction
        const back = Math.cos(phase) < 0;
        const a = Math.asin(Math.max(-1, Math.min(1, query.x / reach)));
        cursor = null;
        phase = still && still.matches ? 0 : back ? Math.PI - a : a;
    }, .35);
    wake();
}

/* ---- drawing ---- */

let width = 0, height = 0, scale = 1, ratio = 1;

function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.clientWidth === width && canvas.clientHeight === height && dpr === ratio) return;
    width = canvas.clientWidth; height = canvas.clientHeight; ratio = dpr;
    if (!width || !height) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    scale = height / HEIGHT;
    reach = .42 * width / scale;
    if (width / scale > span) build(Math.max(width, screen.width) / scale);
}

function draw(dt) {
    for (const c of cells) c.d = dist(c, query);
    const probed = cells.slice().sort((a, b) => a.d - b.d).slice(0, PROBES);
    const near = [].concat(...probed.map(c => c.points))
        .sort((a, b) => dist(a, query) - dist(b, query)).slice(0, K);

    const blend = 1 - Math.exp(-dt / .09);
    const half = width / scale / 2 + 2 * CELL_W;
    const shown = cells.filter(c => c.visible && Math.abs(c.x) < half);
    for (const c of cells) {
        const hot = probed.includes(c);
        const fill = hot ? PROBED : ramp(c.d);
        const dark = fill[0] + fill[1] + fill[2] < 450;
        const look = fill.concat(hot ? DOT_PROBED : dark ? DOT_ON_DARK : DOT_ON_LIGHT, hot ? 5.8 : 4.2);
        c.look = c.look ? c.look.map((v, i) => v + blend * (look[i] - v)) : look;
    }

    const s = scale * ratio;
    g.setTransform(s, 0, 0, s, canvas.width / 2, 0);
    for (const c of shown) { g.fillStyle = css(c.look.slice(0, 3)); g.fill(c.shape); }
    g.strokeStyle = "#fff"; g.lineWidth = 1.3; g.lineCap = g.lineJoin = "round";
    g.stroke(borders);
    for (const c of shown) {
        g.strokeStyle = css(c.look.slice(3, 6)); g.lineWidth = c.look[6];
        g.stroke(c.dots);
    }

    const disc = (p, r) => { g.beginPath(); g.arc(p.x, p.y, r, 0, 2 * Math.PI); };
    if (near.length) {          // radius of the K-th neighbor
        const r = dist(near[near.length - 1], query), dash = 2 * Math.PI * r / 52;
        g.strokeStyle = "rgba(0,0,0,.27)"; g.lineWidth = 1.1; g.lineCap = "butt";
        g.setLineDash([.58 * dash, .42 * dash]);
        disc(query, r); g.stroke();
        g.setLineDash([]);
    }
    g.strokeStyle = "#e5382a"; g.lineWidth = 1.6; g.lineCap = "round";
    g.beginPath();
    for (const p of near) { g.moveTo(query.x, query.y); g.lineTo(p.x, p.y); }
    g.stroke();
    g.strokeStyle = "#fff"; g.lineWidth = 1.1; g.fillStyle = "#e5382a";
    for (const p of near) { disc(p, 4.05); g.fill(); g.stroke(); }
    for (const [r, c] of [[9.5, "#fff"], [7.8, "#e5382a"], [3, "#fff"]]) {
        disc(query, r); g.fillStyle = c; g.fill();
    }
}

/* ---- the loop: stops once the page covers the banner ---- */

let running = false, last = 0, woken = 0;

function wake() {
    woken = performance.now();
    if (running) return;
    running = true; last = woken;
    requestAnimationFrame(frame);
}

function frame(now) {
    const calm = still && still.matches;
    if (window.pageYOffset >= height && height || calm && now - woken > 2000) {
        running = false;
        return;
    }
    const dt = Math.max(0, Math.min(.05, (now - last) / 1000));
    last = now;
    fit();
    if (width && height) {
        if (!cursor && !calm) phase = (phase + dt * PACE / reach) % (2 * Math.PI);
        const fade = Math.exp(-dt / ease), t = target();
        lag = { x: lag.x * fade, y: lag.y * fade };
        query = { x: t.x + lag.x, y: t.y + lag.y };
        draw(dt);
    }
    requestAnimationFrame(frame);
}

canvas.className = img.className;
canvas.setAttribute("aria-hidden", "true");
canvas.style.cursor = "none";
canvas.style.touchAction = "pan-y"; // sideways drags steer, vertical ones scroll
img.parentNode.replaceChild(canvas, img);

for (const type of ["pointerenter", "pointerdown", "pointermove"]) canvas.addEventListener(type, follow);
for (const type of ["pointerleave", "pointercancel"]) canvas.addEventListener(type, release);
window.addEventListener("scroll", wake, { passive: true });
window.addEventListener("resize", wake);
wake();
})();
