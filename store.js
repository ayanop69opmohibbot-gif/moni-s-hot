// Data layer for the whole site. Every page talks to `Store`, never to localStorage directly.
//
//  * SERVER mode  - when the site is opened through `node server.js`. Data lives on the server, so products you
//                   add in the admin panel appear for every visitor, and every order / message / sign-up reaches the admin.
//  * BROWSER mode - when the site is opened as plain files or on static hosting. Data lives in this browser only
//                   (fine for testing, but visitors on other devices will NOT see admin changes).
(function (root) {
    var LS = root.localStorage;
    function lsGet(k, d) { try { var v = JSON.parse(LS.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    function lsSet(k, v) { try { LS.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function fail(msg) { var e = new Error(msg); e.userMessage = msg; return Promise.reject(e); }

    var Store = { mode: "browser" };

    // ---------- detect backend
    Store.ready = (function () {
        if (!/^https?:$/.test(location.protocol)) return Promise.resolve();
        var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
        var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 1500);
        return fetch("/api/ping", { cache: "no-store", signal: ctl ? ctl.signal : undefined })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { if (j && j.ok) Store.mode = "server"; })
            .catch(function () { })
            .then(function () { clearTimeout(timer); });
    })();

    // ---------- server request helper
    function api(method, url, body, admin, user) {
        var h = { "Content-Type": "application/json" };
        if (admin) { var t = sessionStorage.getItem("adminToken"); if (t) h.Authorization = "Bearer " + t; }
        if (user) { var ut = sessionStorage.getItem("userToken"); if (ut) h.Authorization = "Bearer " + ut; }
        return fetch(url, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (j) {
                    if (r.status === 401 && admin) { sessionStorage.removeItem("adminLoggedIn"); sessionStorage.removeItem("adminToken"); Store.onAuthLost && Store.onAuthLost(); }
                    if (!r.ok) { var e = new Error(j.error || "Request failed"); e.userMessage = j.error || "Request failed"; e.status = r.status; throw e; }
                    return j;
                });
            });
    }
    function both(serverFn, localFn) { return Store.ready.then(function () { return Store.mode === "server" ? serverFn() : localFn(); }); }

    // ---------- login state of the shop visitor
    Store.isLoggedIn = function () { try { return !!sessionStorage.getItem("islogin"); } catch (e) { return false; } };
    Store.requireLogin = function () {   // remember where the visitor was, then send to login page
        try { sessionStorage.setItem("afterLogin", location.pathname.split("/").pop() + location.search); } catch (e) { }
        location.assign("login.html");
    };
    Store.afterLoginTarget = function () {
        var t = null; try { t = sessionStorage.getItem("afterLogin"); sessionStorage.removeItem("afterLogin"); } catch (e) { }
        return t && /^[\w%. -]+\.html(\?[^#\s]*)?$/.test(t) ? t : "index.html";
    };

    // ---------- images
    // Pictures uploaded while the server is not running are kept in this browser as "img:<id>".
    var uploaded = null;
    function loadUploaded() { if (!uploaded) uploaded = lsGet("uploadedImages", {}); return uploaded; }
    root.addEventListener("storage", function (e) { if (e.key === "uploadedImages") uploaded = null; });
    Store.imgSrc = function (name) {
        name = String(name == null ? "" : name);
        if (name.indexOf("img:") === 0) return loadUploaded()[name.slice(4)] || "";
        if (/^(https?:)?\/\//i.test(name) || /^uploads\//.test(name) || /^images\//.test(name)) return name;
        return "images/" + name;
    };

    // ---------- local-mode seed
    function seedLocal() {
        if (!lsGet("products")) lsSet("products", clone(SEED.products));
        if (!lsGet("categories")) lsSet("categories", clone(SEED.categories));
    }

    // =================================================== PUBLIC
    Store.getProducts = function () {
        return both(function () { return api("GET", "/api/products"); },
            function () { seedLocal(); return lsGet("products", []).filter(function (p) { return p.available !== false; }); });
    };
    Store.getCategories = function () {
        return both(function () { return api("GET", "/api/categories"); }, function () { seedLocal(); return lsGet("categories", []); });
    };
    Store.addOrder = function (order) {
        return both(function () { return api("POST", "/api/orders", order, false, true); },
            function () { var l = lsGet("orders", []); l.push(order); return lsSet("orders", l) ? order : fail("Could not save the order"); });
    };
    Store.cancelOrder = function (orderId) {
        return both(function () { return api("POST", "/api/orders/" + encodeURIComponent(orderId) + "/cancel"); }, function () { return { ok: true }; });
    };
    Store.addMessage = function (m) {
        return both(function () { return api("POST", "/api/messages", m); }, function () {
            var l = lsGet("contactMessages", []);
            l.push({ id: uid("m"), name: m.name, email: m.email, subject: m.subject, message: m.message, date: new Date().toISOString(), read: false });
            return lsSet("contactMessages", l) ? { ok: true } : fail("Could not save your message");
        });
    };
    Store.registerUser = function (u) {
        return both(function () { return api("POST", "/api/users/register", u); }, function () {
            var l = lsGet("users", []);
            if (l.some(function (x) { return x.email.toLowerCase() === u.email.toLowerCase(); })) return fail("This email is already registered");
            l.push({ id: uid("u"), name: u.name, email: u.email, password: u.password, joined: new Date().toISOString() });
            lsSet("users", l);
            // keep the old single-account keys working
            LS.setItem("name", u.name); LS.setItem("email", u.email); LS.setItem("password", u.password);
            return { ok: true };
        });
    };
    Store.loginUser = function (email, password) {
        return both(function () {
            return api("POST", "/api/users/login", { email: email, password: password }).then(function (u) {
                if (u.token) sessionStorage.setItem("userToken", u.token);
                return u;
            });
        }, function () {
            var u = lsGet("users", []).find(function (x) { return x.email.toLowerCase() === email.toLowerCase() && x.password === password; });
            if (!u && email === LS.getItem("email") && password === LS.getItem("password")) u = { name: LS.getItem("name"), email: email };
            return u ? { name: u.name, email: u.email } : fail("Email or password is wrong");
        });
    };

    // =================================================== ADMIN
    function localCreds() { return lsGet("adminCreds", { username: "admin", password: "12345" }); }
    Store.adminLogin = function (username, password) {
        return both(function () {
            return api("POST", "/api/admin/login", { username: username, password: password }).then(function (j) { sessionStorage.setItem("adminToken", j.token); return true; });
        }, function () {
            var c = localCreds();
            return (username === c.username && password === c.password) ? true : fail("Invalid Username or Password");
        });
    };
    Store.adminCheck = function () {
        return both(function () { return api("GET", "/api/admin/check", undefined, true).then(function () { return true; }, function () { return false; }); },
            function () { return true; });
    };

    // ----- products
    Store.adminProducts = function () {
        return both(function () { return api("GET", "/api/admin/products", undefined, true); }, function () { seedLocal(); return lsGet("products", []); });
    };
    function checkProduct(p, list, id) {
        var title = String(p.title || "").trim(), cat = String(p.category || "").trim(), desc = String(p.description || "").trim(), price = Number(p.peice);
        if (title.length < 3) return "Title must be at least 3 characters";
        if (cat.length < 2) return "Choose a category";
        if (!isFinite(price) || price < 1 || Math.floor(price) !== price) return "Price must be a whole number of 1 or more";
        if (desc.length < 10) return "Description must be at least 10 characters";
        if (!String(p.Image || "").trim()) return "Choose or upload an image";
        if (list.some(function (x) { return x.id !== id && x.title.toLowerCase() === title.toLowerCase(); })) return "A product with this title already exists";
        return "";
    }
    function localEnsureCat(name) {
        var c = lsGet("categories", []);
        if (!c.some(function (x) { return x.name === name; })) { c.push({ name: name, image: "" }); lsSet("categories", c); }
    }
    Store.saveProduct = function (p) {
        return both(function () {
            return p.id ? api("PUT", "/api/admin/products/" + p.id, p, true) : api("POST", "/api/admin/products", p, true);
        }, function () {
            seedLocal();
            var list = lsGet("products", []), err = checkProduct(p, list, p.id);
            if (err) return fail(err);
            var item = { id: p.id || uid("p"), title: p.title.trim(), description: p.description.trim(), category: p.category.trim(), peice: Number(p.peice),
                         Image: p.Image.trim(), bestSeller: !!p.bestSeller, available: p.available !== false };
            var i = list.findIndex(function (x) { return x.id === item.id; });
            if (i >= 0) list[i] = item; else list.push(item);
            lsSet("products", list); localEnsureCat(item.category);
            return item;
        });
    };
    Store.deleteProduct = function (id) {
        return both(function () { return api("DELETE", "/api/admin/products/" + id, undefined, true); },
            function () { lsSet("products", lsGet("products", []).filter(function (p) { return p.id !== id; })); return { ok: true }; });
    };

    // ----- categories
    Store.saveCategory = function (c) {   // {name, image, oldName?}
        return both(function () { return api("POST", "/api/admin/categories", c, true); }, function () {
            seedLocal();
            var name = String(c.name || "").trim(), list = lsGet("categories", []);
            if (name.length < 2) return fail("Category name must be at least 2 characters");
            if (list.some(function (x) { return x.name.toLowerCase() === name.toLowerCase() && x.name !== c.oldName; })) return fail("This category already exists");
            if (c.oldName) {
                var cur = list.find(function (x) { return x.name === c.oldName; });
                if (!cur) return fail("Category not found");
                cur.name = name; cur.image = c.image || "";
                var prods = lsGet("products", []); prods.forEach(function (p) { if (p.category === c.oldName) p.category = name; }); lsSet("products", prods);
            } else list.push({ name: name, image: c.image || "" });
            lsSet("categories", list); return { ok: true };
        });
    };
    Store.deleteCategory = function (name) {
        return both(function () { return api("DELETE", "/api/admin/categories/" + encodeURIComponent(name), undefined, true); }, function () {
            if (lsGet("products", []).some(function (p) { return p.category === name; })) return fail("Move or delete the products in this category first");
            lsSet("categories", lsGet("categories", []).filter(function (c) { return c.name !== name; })); return { ok: true };
        });
    };

    // ----- orders
    Store.adminOrders = function () {
        return both(function () { return api("GET", "/api/admin/orders", undefined, true); }, function () {
            if (root.syncOrderStatuses) root.syncOrderStatuses();
            return lsGet("orders", []);
        });
    };
    Store.setOrderStatus = function (id, status) {
        return both(function () { return api("PATCH", "/api/admin/orders/" + encodeURIComponent(id), { status: status }, true); }, function () {
            var l = lsGet("orders", []); l.forEach(function (o) { if (o.orderId === id) o.status = status; }); lsSet("orders", l);
            var cur = lsGet("order", null); if (cur && cur.orderId === id) { cur.status = status; lsSet("order", cur); }
            return { ok: true };
        });
    };
    Store.deleteOrder = function (id) {
        return both(function () { return api("DELETE", "/api/admin/orders/" + encodeURIComponent(id), undefined, true); },
            function () { lsSet("orders", lsGet("orders", []).filter(function (o) { return o.orderId !== id; })); return { ok: true }; });
    };
    Store.clearOrders = function () {
        return both(function () { return api("DELETE", "/api/admin/orders", undefined, true); }, function () { LS.removeItem("orders"); return { ok: true }; });
    };

    // ----- messages
    Store.adminMessages = function () {
        return both(function () { return api("GET", "/api/admin/messages", undefined, true); }, function () {
            var l = lsGet("contactMessages", []);
            l.forEach(function (m, i) { if (!m.id) m.id = "m" + i + "-" + (m.date || ""); });
            return l;
        });
    };
    function localMsgWrite(fn) {
        var l = lsGet("contactMessages", []); l.forEach(function (m, i) { if (!m.id) m.id = "m" + i + "-" + (m.date || ""); });
        lsSet("contactMessages", fn(l)); return { ok: true };
    }
    Store.markMessage = function (id, read) {
        return both(function () { return api("PATCH", "/api/admin/messages/" + id, { read: read }, true); },
            function () { return localMsgWrite(function (l) { l.forEach(function (m) { if (m.id === id) m.read = read; }); return l; }); });
    };
    Store.deleteMessage = function (id) {
        return both(function () { return api("DELETE", "/api/admin/messages/" + id, undefined, true); },
            function () { return localMsgWrite(function (l) { return l.filter(function (m) { return m.id !== id; }); }); });
    };
    Store.clearMessages = function () {
        return both(function () { return api("DELETE", "/api/admin/messages", undefined, true); }, function () { LS.removeItem("contactMessages"); return { ok: true }; });
    };

    // ----- users
    Store.adminUsers = function () {
        return both(function () { return api("GET", "/api/admin/users", undefined, true); }, function () {
            var l = lsGet("users", []).map(function (u) { return { id: u.id, name: u.name, email: u.email, joined: u.joined }; });
            var e = LS.getItem("email");
            if (e && !l.some(function (u) { return u.email === e; })) l.push({ id: "legacy", name: LS.getItem("name") || "", email: e, joined: "" });
            return l;
        });
    };
    Store.deleteUser = function (id) {
        return both(function () { return api("DELETE", "/api/admin/users/" + id, undefined, true); }, function () {
            if (id === "legacy") { LS.removeItem("name"); LS.removeItem("email"); LS.removeItem("password"); }
            lsSet("users", lsGet("users", []).filter(function (u) { return u.id !== id; })); return { ok: true };
        });
    };

    // ----- images
    Store.adminImages = function () {
        return both(function () { return api("GET", "/api/admin/images", undefined, true); }, function () { return Object.keys(loadUploaded()).map(function (k) { return "img:" + k; }).concat(clone(SEED.images)); });
    };
    function compressImage(file) {   // -> JPEG data URL, max 800px wide, so it fits in browser storage
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file), img = new Image();
            img.onload = function () {
                var max = 800, w = img.width, h = img.height, k = Math.min(1, max / Math.max(w, h));
                var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
                var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", 0.78));
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("This file is not a valid picture")); };
            img.src = url;
        });
    }
    Store.uploadImage = function (file) {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return fail("Only JPG, PNG, WEBP or GIF pictures are allowed");
        if (file.size > 8 * 1024 * 1024) return fail("Picture must be smaller than 8 MB");
        return Store.ready.then(function () {
            if (Store.mode === "server") {
                return new Promise(function (resolve, reject) {
                    var fr = new FileReader();
                    fr.onload = function () { resolve(fr.result); };
                    fr.onerror = function () { reject(new Error("Could not read the file")); };
                    fr.readAsDataURL(file);
                }).then(function (data) { return api("POST", "/api/admin/upload", { data: data }, true); });
            }
            return compressImage(file).then(function (dataUrl) {
                var all = loadUploaded(), id = uid("i");
                all[id] = dataUrl;
                if (!lsSet("uploadedImages", all)) { delete all[id]; return fail("Browser storage is full. Delete some pictures or run the site with node server.js."); }
                return { path: "img:" + id };
            });
        });
    };

    // ----- settings / backup
    Store.saveAdminSettings = function (s) {   // {current, username, password}
        return both(function () { return api("POST", "/api/admin/settings", s, true); }, function () {
            var c = localCreds();
            if (s.current !== c.password) return fail("Current password is wrong");
            if (!s.username || s.username.length < 3) return fail("Username must be at least 3 characters");
            if (s.password && s.password.length < 6) return fail("New password must be at least 6 characters");
            lsSet("adminCreds", { username: s.username, password: s.password || c.password }); return { ok: true };
        });
    };
    Store.resetProducts = function () {
        return both(function () { return api("POST", "/api/admin/reset-products", {}, true); }, function () {
            lsSet("products", clone(SEED.products)); lsSet("categories", clone(SEED.categories)); return { ok: true };
        });
    };
    Store.exportAll = function () {
        return both(function () { return api("GET", "/api/admin/export", undefined, true); }, function () {
            seedLocal();
            return { products: lsGet("products", []), categories: lsGet("categories", []), orders: lsGet("orders", []), messages: lsGet("contactMessages", []) };
        });
    };

    root.Store = Store;
})(window);
