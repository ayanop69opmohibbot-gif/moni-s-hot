// Moni's Hot - tiny web server + JSON API (no npm packages needed).
//   Run:   node server.js      then open  http://localhost:3000
//   Admin: http://localhost:3000/login.html   (default  admin / 12345  - change it in Settings!)
// All data is saved in ./data/db.json, uploaded pictures in ./uploads/
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const SEED = require("./seed-data.js");

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
// On a host with a persistent disk, set DATA_DIR (e.g. /var/data) so orders, products and uploads survive restarts
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOAD_DIR = process.env.DATA_DIR ? path.join(DATA_DIR, "uploads") : path.join(ROOT, "uploads");
// first-run admin password (change it later in Admin > Settings). Set ADMIN_PASSWORD on the host instead of using 12345
const FIRST_ADMIN_PASS = process.env.ADMIN_PASSWORD || "12345";
const MAX_QTY = 10;
// site artwork that should not be offered as a product picture
const EXCLUDE_IMAGES = /logo|marshall|hero|gemini|rUStB|1698133860/i;
const PAYMENTS = ["cod", "card", "jazz", "easy"];

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------------------------------------------------------------- helpers
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = (p) => p + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max || 500);

function hashPassword(pw, saltHex) {
    const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
    const hash = crypto.scryptSync(pw, salt, 32);
    return salt.toString("hex") + ":" + hash.toString("hex");
}
function checkPassword(pw, stored) {
    try {
        const [salt, hash] = stored.split(":");
        const test = hashPassword(pw, salt).split(":")[1];
        return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
    } catch (e) { return false; }
}

// ---------------------------------------------------------------- database
let db;
function load() {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch (e) { db = null; }
    if (!db) {
        db = { products: clone(SEED.products), categories: clone(SEED.categories), orders: [], messages: [], users: [],
               settings: { adminUser: "admin", adminPass: hashPassword(FIRST_ADMIN_PASS) } };
        save();
    }
    ["products", "categories", "orders", "messages", "users"].forEach((k) => { if (!Array.isArray(db[k])) db[k] = []; });
    if (!db.settings) db.settings = { adminUser: "admin", adminPass: hashPassword(FIRST_ADMIN_PASS) };
}
function save() {
    const tmp = DB_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
}
load();

// ---------------------------------------------------------------- order status clock (same rules as order-status.js)
function advance(o) {
    if (!o.startTime) return false;
    const cur = o.status || "Order Placed";
    if (cur === "Cancelled" || cur === "Delivered") return false;
    const flow = ["Order Placed", "Preparing", "Out for Delivery", "Delivered"];
    const e = Date.now() - o.startTime;
    const next = e >= 30 * 60000 ? "Delivered" : e >= 14 * 60000 ? "Out for Delivery" : e >= 7 * 60000 ? "Preparing" : "Order Placed";
    if (flow.indexOf(next) > flow.indexOf(cur)) { o.status = next; return true; }
    return false;
}

// ---------------------------------------------------------------- sessions (admin)
const sessions = new Map();   // token -> expiry
const attempts = new Map();   // ip -> {n, t}
function newSession() {
    const t = crypto.randomBytes(32).toString("hex");
    sessions.set(t, Date.now() + 12 * 3600 * 1000);
    return t;
}
const userSessions = new Map(); // token -> {email, exp}
function newUserSession(email) {
    const t = crypto.randomBytes(32).toString("hex");
    userSessions.set(t, { email, exp: Date.now() + 24 * 3600 * 1000 });
    return t;
}
function userOf(req) {
    const h = req.headers.authorization || "";
    const s = userSessions.get(h.startsWith("Bearer ") ? h.slice(7) : "");
    if (!s) return null;
    if (s.exp < Date.now()) return null;
    return s;
}
function isAdmin(req) {
    const h = req.headers.authorization || "";
    const t = h.startsWith("Bearer ") ? h.slice(7) : "";
    const exp = sessions.get(t);
    if (!exp) return false;
    if (exp < Date.now()) { sessions.delete(t); return false; }
    return true;
}

// ---------------------------------------------------------------- http utils
function send(res, code, body, headers) {
    const isObj = typeof body === "object" && !Buffer.isBuffer(body);
    res.writeHead(code, Object.assign({ "Content-Type": isObj ? "application/json; charset=utf-8" : "text/plain", "Cache-Control": "no-store" }, headers || {}));
    res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        let size = 0; const chunks = [];
        req.on("data", (c) => { size += c.length; if (size > limit) { reject({ code: 413, msg: "Too large" }); req.destroy(); } else chunks.push(c); });
        req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); } catch (e) { reject({ code: 400, msg: "Invalid JSON" }); } });
        req.on("error", () => reject({ code: 400, msg: "Bad request" }));
    });
}
const fail = (code, msg) => { throw { code, msg }; };

// ---------------------------------------------------------------- validation
function cleanProduct(b, existingId) {
    const title = str(b.title, 80), description = str(b.description, 400), category = str(b.category, 40), image = str(b.Image, 300);
    const price = Number(b.peice);
    if (title.length < 3) fail(400, "Title must be at least 3 characters");
    if (category.length < 2) fail(400, "Choose a category");
    if (!Number.isFinite(price) || price < 1 || price > 1000000 || Math.floor(price) !== price) fail(400, "Price must be a whole number of 1 or more");
    if (description.length < 10) fail(400, "Description must be at least 10 characters");
    if (!image) fail(400, "Choose or upload an image");
    if (db.products.some((p) => p.id !== existingId && p.title.toLowerCase() === title.toLowerCase())) fail(400, "A product with this title already exists");
    return { title, description, category, peice: price, Image: image, bestSeller: !!b.bestSeller, available: b.available !== false };
}
function ensureCategory(name, image) {
    if (!db.categories.some((c) => c.name === name)) db.categories.push({ name, image: image || "" });
}

// ---------------------------------------------------------------- API
async function api(req, res, url) {
    const m = req.method, p = url.pathname;
    const body = (m === "POST" || m === "PUT" || m === "PATCH") ? await readBody(req, p === "/api/admin/upload" ? 6e6 : 2e5) : {};
    let r;

    // ----- public
    if (p === "/api/ping" && m === "GET") return send(res, 200, { ok: true });
    if (p === "/api/products" && m === "GET") return send(res, 200, db.products.filter((x) => x.available !== false));
    if (p === "/api/categories" && m === "GET") return send(res, 200, db.categories);

    if (p === "/api/orders" && m === "POST") {
        const session = userOf(req);
        if (!session) fail(401, "Please log in to place your order");
        const name = str(body.customer, 60), email = str(body.email, 80), phone = str(body.phone, 15),
              address = str(body.address, 250), city = str(body.city, 40), payment = str(body.payment, 20).toLowerCase();
        if (name.length < 3) fail(400, "Enter your full name");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a valid email");
        if (!/^03\d{2}-?\d{7}$/.test(phone)) fail(400, "Enter a valid phone (03XX-XXXXXXX)");
        if (address.length < 10) fail(400, "Enter your complete address");
        if (!city) fail(400, "Select a city");
        if (!PAYMENTS.includes(payment)) fail(400, "Choose a payment method");
        if (!Array.isArray(body.cart) || !body.cart.length || body.cart.length > 50) fail(400, "Your cart is empty");
        const cart = []; let total = 0;
        body.cart.forEach((it) => {
            const prod = db.products.find((x) => x.title === it.title && x.available !== false);
            const qty = parseInt(it.qty, 10);
            if (!prod) fail(400, "\"" + str(it.title, 60) + "\" is no longer available");
            if (!(qty >= 1 && qty <= MAX_QTY)) fail(400, "Invalid quantity");
            const ex = cart.find((c) => c.title === prod.title);
            if (ex) ex.qty = Math.min(MAX_QTY, ex.qty + qty); else cart.push({ Image: prod.Image, title: prod.title, peice: prod.peice, qty });
        });
        cart.forEach((c) => { total += c.peice * c.qty; });
        const order = { orderId: "MH-" + Date.now() + "-" + Math.floor(Math.random() * 1000), customer: name, email, phone, address, city,
                        payment, total, cart, status: "Order Placed", startTime: Date.now(), userEmail: session.email };
        db.orders.push(order); save();
        return send(res, 201, order);
    }
    if ((r = p.match(/^\/api\/orders\/([^/]+)\/cancel$/)) && m === "POST") {
        const o = db.orders.find((x) => x.orderId === decodeURIComponent(r[1]));
        if (!o) fail(404, "Order not found");
        if (o.status === "Delivered") fail(400, "Delivered orders cannot be cancelled");
        o.status = "Cancelled"; save();
        return send(res, 200, { ok: true });
    }
    if (p === "/api/messages" && m === "POST") {
        const msg = { id: uid("m"), name: str(body.name, 60), email: str(body.email, 80), subject: str(body.subject, 80), message: str(body.message, 1000),
                      date: new Date().toISOString(), read: false };
        if (!msg.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.email) || !msg.message) fail(400, "Please fill in your name, a valid email and your message");
        db.messages.push(msg); save();
        return send(res, 201, { ok: true });
    }
    if (p === "/api/users/register" && m === "POST") {
        const name = str(body.name, 30), email = str(body.email, 80).toLowerCase(), pw = String(body.password || "");
        if (name.length < 3) fail(400, "Name must be at least 3 characters");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a valid email");
        if (pw.length < 6 || pw.length > 64) fail(400, "Password must be 6 to 64 characters");
        if (db.users.some((u) => u.email === email)) fail(400, "This email is already registered");
        db.users.push({ id: uid("u"), name, email, pass: hashPassword(pw), joined: new Date().toISOString() }); save();
        return send(res, 201, { ok: true });
    }
    if (p === "/api/users/login" && m === "POST") {
        const ip = req.socket.remoteAddress, a = attempts.get(ip) || { n: 0, t: Date.now() };
        if (Date.now() - a.t > 60000) { a.n = 0; a.t = Date.now(); }
        if (a.n >= 8) fail(429, "Too many attempts. Try again in a minute.");
        const u = db.users.find((x) => x.email === str(body.email, 80).toLowerCase());
        if (!u || !checkPassword(String(body.password || ""), u.pass)) { a.n++; attempts.set(ip, a); fail(401, "Email or password is wrong"); }
        return send(res, 200, { name: u.name, email: u.email, token: newUserSession(u.email) });
    }
    if (p === "/api/admin/login" && m === "POST") {
        const ip = req.socket.remoteAddress, a = attempts.get(ip) || { n: 0, t: Date.now() };
        if (Date.now() - a.t > 60000) { a.n = 0; a.t = Date.now(); }
        if (a.n >= 8) fail(429, "Too many attempts. Try again in a minute.");
        if (str(body.username, 60) !== db.settings.adminUser || !checkPassword(String(body.password || ""), db.settings.adminPass)) {
            a.n++; attempts.set(ip, a); fail(401, "Invalid Username or Password");
        }
        return send(res, 200, { token: newSession() });
    }

    // ----- admin only
    if (!p.startsWith("/api/admin/")) fail(404, "Not found");
    if (!isAdmin(req)) fail(401, "Please log in again");
    const a = p.slice(11);

    if (a === "check" && m === "GET") return send(res, 200, { ok: true });
    if (a === "products" && m === "GET") return send(res, 200, db.products);
    if (a === "products" && m === "POST") {
        const d = cleanProduct(body); const prod = Object.assign({ id: uid("p") }, d);
        db.products.push(prod); ensureCategory(d.category); save(); return send(res, 201, prod);
    }
    if ((r = a.match(/^products\/([^/]+)$/))) {
        const i = db.products.findIndex((x) => x.id === r[1]);
        if (i < 0) fail(404, "Product not found");
        if (m === "PUT") { const d = cleanProduct(body, r[1]); db.products[i] = Object.assign({ id: r[1] }, d); ensureCategory(d.category); save(); return send(res, 200, db.products[i]); }
        if (m === "DELETE") { db.products.splice(i, 1); save(); return send(res, 200, { ok: true }); }
    }
    if (a === "categories" && m === "POST") {
        const name = str(body.name, 40), image = str(body.image, 300), old = str(body.oldName, 40);
        if (name.length < 2) fail(400, "Category name must be at least 2 characters");
        if (db.categories.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.name !== old)) fail(400, "This category already exists");
        if (old) {
            const c = db.categories.find((x) => x.name === old);
            if (!c) fail(404, "Category not found");
            c.name = name; c.image = image;
            db.products.forEach((x) => { if (x.category === old) x.category = name; });
        } else db.categories.push({ name, image });
        save(); return send(res, 200, { ok: true });
    }
    if ((r = a.match(/^categories\/(.+)$/)) && m === "DELETE") {
        const name = decodeURIComponent(r[1]);
        if (db.products.some((x) => x.category === name)) fail(400, "Move or delete the products in this category first");
        db.categories = db.categories.filter((c) => c.name !== name); save(); return send(res, 200, { ok: true });
    }
    if (a === "orders" && m === "GET") {
        let ch = false; db.orders.forEach((o) => { if (advance(o)) ch = true; }); if (ch) save();
        return send(res, 200, db.orders);
    }
    if (a === "orders" && m === "DELETE") { db.orders = []; save(); return send(res, 200, { ok: true }); }
    if ((r = a.match(/^orders\/([^/]+)$/))) {
        const i = db.orders.findIndex((x) => x.orderId === decodeURIComponent(r[1]));
        if (i < 0) fail(404, "Order not found");
        if (m === "PATCH") {
            const st = str(body.status, 30);
            if (!["Order Placed", "Preparing", "Out for Delivery", "Delivered", "Cancelled"].includes(st)) fail(400, "Bad status");
            db.orders[i].status = st; save(); return send(res, 200, db.orders[i]);
        }
        if (m === "DELETE") { db.orders.splice(i, 1); save(); return send(res, 200, { ok: true }); }
    }
    if (a === "messages" && m === "GET") return send(res, 200, db.messages);
    if (a === "messages" && m === "DELETE") { db.messages = []; save(); return send(res, 200, { ok: true }); }
    if ((r = a.match(/^messages\/([^/]+)$/))) {
        const i = db.messages.findIndex((x) => x.id === r[1]);
        if (i < 0) fail(404, "Message not found");
        if (m === "PATCH") { db.messages[i].read = !!body.read; save(); return send(res, 200, db.messages[i]); }
        if (m === "DELETE") { db.messages.splice(i, 1); save(); return send(res, 200, { ok: true }); }
    }
    if (a === "users" && m === "GET") return send(res, 200, db.users.map((u) => ({ id: u.id, name: u.name, email: u.email, joined: u.joined })));
    if ((r = a.match(/^users\/([^/]+)$/)) && m === "DELETE") { db.users = db.users.filter((u) => u.id !== r[1]); save(); return send(res, 200, { ok: true }); }
    if (a === "images" && m === "GET") {
        const list = [];
        fs.readdirSync(path.join(ROOT, "images")).forEach((f) => { if (/\.(jpe?g|png|webp|gif)$/i.test(f) && !EXCLUDE_IMAGES.test(f)) list.push(f); });
        fs.readdirSync(UPLOAD_DIR).forEach((f) => { if (/\.(jpe?g|png|webp|gif)$/i.test(f)) list.push("uploads/" + f); });
        return send(res, 200, list);
    }
    if (a === "upload" && m === "POST") {
        const mt = /^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/.exec(String(body.data || ""));
        if (!mt) fail(400, "Only JPG, PNG, WEBP or GIF images are allowed");
        const buf = Buffer.from(mt[3], "base64");
        if (buf.length > 4 * 1024 * 1024) fail(400, "Image must be smaller than 4 MB");
        const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[mt[1]];
        const name = uid("img") + "." + ext;
        fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
        return send(res, 201, { path: "uploads/" + name });
    }
    if (a === "settings" && m === "POST") {
        const user = str(body.username, 30), pw = String(body.password || "");
        if (!checkPassword(String(body.current || ""), db.settings.adminPass)) fail(400, "Current password is wrong");
        if (user.length < 3) fail(400, "Username must be at least 3 characters");
        if (pw && (pw.length < 6 || pw.length > 64)) fail(400, "New password must be 6 to 64 characters");
        db.settings.adminUser = user; if (pw) db.settings.adminPass = hashPassword(pw); save();
        return send(res, 200, { ok: true });
    }
    if (a === "export" && m === "GET") {
        const copy = clone(db); delete copy.settings; copy.users = copy.users.map((u) => ({ id: u.id, name: u.name, email: u.email, joined: u.joined }));
        return send(res, 200, copy);
    }
    if (a === "reset-products" && m === "POST") { db.products = clone(SEED.products); db.categories = clone(SEED.categories); save(); return send(res, 200, { ok: true }); }
    fail(404, "Not found");
}

// ---------------------------------------------------------------- static files
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
    ".jfif": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const BLOCKED = /^(data|node_modules|\.vscode)(\/|$)|^(server\.js|package\.json|package-lock\.json)$|\.zip$/i;

function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const isUpload = /^uploads\//.test(rel);
    const base = isUpload ? UPLOAD_DIR : ROOT;
    const file = path.normalize(path.join(base, isUpload ? rel.slice(8) : rel));
    if (!file.startsWith(base + path.sep) || BLOCKED.test(rel) || rel.split("/").some((s) => s.startsWith("."))) return send(res, 404, "Not found");
    fs.stat(file, (err, st) => {
        if (err || !st.isFile()) return send(res, 404, "Not found");
        const ext = path.extname(file).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "X-Content-Type-Options": "nosniff",
                             "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300" });
        fs.createReadStream(file).pipe(res);
    });
}

http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
        if (url.pathname.startsWith("/api/")) await api(req, res, url);
        else if (req.method === "GET" || req.method === "HEAD") serveStatic(req, res, url);
        else send(res, 405, "Method not allowed");
    } catch (e) {
        if (e && e.code) send(res, e.code, { error: e.msg });
        else { console.error(e); send(res, 500, { error: "Server error" }); }
    }
}).listen(PORT, () => {
    console.log("Moni's Hot is running:  http://localhost:" + PORT);
    console.log("Admin panel:            http://localhost:" + PORT + "/login.html");
});
