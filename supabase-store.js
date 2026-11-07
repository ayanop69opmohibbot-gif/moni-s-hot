// Supabase backend for Store (loaded after store.js).
// It is used automatically when config.js contains your Supabase URL + anon key. That lets the site run on
// plain static hosting (GitHub Pages, Netlify...) and still be fully dynamic: products, categories, orders,
// users, messages and pictures all live in Supabase, and the admin panel edits them for every visitor.
//
// Security does NOT depend on this file: the rules in supabase/setup.sql (Row Level Security) decide who may do what.
(function (root) {
    var cfg = root.SITE_CONFIG || {};
    var Store = root.Store;
    if (!Store || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

    var URL_ = String(cfg.supabaseUrl).replace(/\/+$/, "");
    var KEY = cfg.supabaseAnonKey;
    var BUCKET = cfg.imageBucket || "product-images";
    var SESSION_KEY = "sb_session";

    Store.mode = "supabase";
    Store.ready = Promise.resolve();

    function fail(msg, status) { var e = new Error(msg); e.userMessage = msg; if (status) e.status = status; return Promise.reject(e); }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    // ------------------------------------------------------------ session
    function getSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; } }
    function setSession(r) {
        var s = { access_token: r.access_token, refresh_token: r.refresh_token,
                  expires_at: r.expires_at || (Math.floor(Date.now() / 1000) + (r.expires_in || 3600)),
                  user: { id: r.user && r.user.id, email: r.user && r.user.email, name: r.user && r.user.user_metadata && r.user.user_metadata.name } };
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { }
        return s;
    }
    function clearSession() {
        try { ["sb_session", "adminLoggedIn", "islogin", "userName", "isAdmin"].forEach(function (k) { sessionStorage.removeItem(k); }); } catch (e) { }
    }
    Store.clearSession = clearSession;

    // returns a valid access token (refreshing it when it is about to expire) or null
    function token() {
        var s = getSession();
        if (!s) return Promise.resolve(null);
        if (s.expires_at - 60 > Date.now() / 1000) return Promise.resolve(s.access_token);
        return raw("POST", "/auth/v1/token?grant_type=refresh_token", { refresh_token: s.refresh_token }, null)
            .then(function (r) { return setSession(r).access_token; })
            .catch(function () { clearSession(); return null; });
    }

    // ------------------------------------------------------------ http
    function raw(method, path, body, bearer, extra) {
        var h = { apikey: KEY, "Content-Type": "application/json" };
        h.Authorization = "Bearer " + (bearer || KEY);
        if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
        return fetch(URL_ + path, { method: method, headers: h, body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)) })
            .then(function (r) {
                return r.text().then(function (t) {
                    var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
                    if (!r.ok) {
                        var msg = (j && (j.message || j.msg || j.error_description || j.error)) || "Request failed";
                        var e = new Error(msg); e.userMessage = friendly(msg, j); e.status = r.status; e.code = j && (j.code || j.error_code); throw e;
                    }
                    return j;
                });
            }, function () { throw Object.assign(new Error("Network error"), { userMessage: "Could not reach the server. Check your internet connection." }); });
    }
    function friendly(msg, j) {
        var code = j && (j.code || j.error_code);
        if (code === "23505") return "A product with this title already exists";
        if (code === "23503") return "Move or delete the products in this category first";
        if (/invalid login credentials|invalid_credentials/i.test(msg)) return "Email or password is wrong";
        if (/already registered|user_already_exists/i.test(msg)) return "This email is already registered";
        if (/email not confirmed/i.test(msg)) return "Please confirm your email first (check your inbox), then log in.";
        if (/password should be at least/i.test(msg)) return "Password must be at least 6 characters";
        if (/rate limit|too many/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
        return msg;
    }
    // call the API as the current visitor (anon when nobody is logged in)
    function call(method, path, body, extra) {
        return token().then(function (t) {
            return raw(method, path, body, t, extra).catch(function (e) {
                if (e.status === 401 || (e.code === "PGRST301")) {          // expired / invalid session
                    if (t) { clearSession(); if (Store.onAuthLost && /\/admin|admin\.html/.test(location.pathname)) Store.onAuthLost(); }
                    e.status = 401;
                }
                throw e;
            });
        });
    }
    function q(v) { return encodeURIComponent(v); }

    // ------------------------------------------------------------ row <-> site shape
    function prodOut(r) {
        return { id: r.id, title: r.title, description: r.description, category: r.category, peice: r.price, Image: r.image,
                 bestSeller: !!r.best_seller, available: r.available !== false };
    }
    function prodIn(p) {
        return { title: String(p.title || "").trim(), description: String(p.description || "").trim(), category: String(p.category || "").trim(),
                 price: Number(p.peice), image: String(p.Image || "").trim(), best_seller: !!p.bestSeller, available: p.available !== false };
    }
    function orderOut(r) {
        return { orderId: r.order_id, customer: r.customer, email: r.email, phone: r.phone, address: r.address, city: r.city, payment: r.payment,
                 total: r.total, cart: r.items || [], status: r.status, startTime: new Date(r.created_at).getTime(), userEmail: r.user_email };
    }
    function msgOut(r) { return { id: r.id, name: r.name, email: r.email, subject: r.subject, message: r.message, date: r.created_at, read: !!r.is_read }; }
    function validateProduct(p) {
        var x = prodIn(p);
        if (x.title.length < 3) return "Title must be at least 3 characters";
        if (x.category.length < 2) return "Choose a category";
        if (!isFinite(x.price) || x.price < 1 || Math.floor(x.price) !== x.price) return "Price must be a whole number of 1 or more";
        if (x.description.length < 10) return "Description must be at least 10 characters";
        if (!x.image) return "Choose or upload an image";
        return "";
    }

    // ============================================================ PUBLIC
    Store.getProducts = function () {
        return call("GET", "/rest/v1/products?select=*&available=eq.true&order=created_at.asc,title.asc").then(function (l) { return (l || []).map(prodOut); });
    };
    Store.getCategories = function () {
        return call("GET", "/rest/v1/categories?select=name,image&order=created_at.asc,name.asc").then(function (l) { return l || []; });
    };
    Store.addOrder = function (o) {
        var items = (o.cart || []).map(function (c) { return { title: c.title, qty: c.qty }; });
        return call("POST", "/rest/v1/rpc/place_order", {
            p_customer: o.customer, p_email: o.email, p_phone: o.phone, p_address: o.address, p_city: o.city, p_payment: o.payment, p_items: items
        });
    };
    Store.cancelOrder = function (orderId) { return call("POST", "/rest/v1/rpc/cancel_my_order", { p_order_id: orderId }).then(function () { return { ok: true }; }); };
    Store.addMessage = function (m) {
        return call("POST", "/rest/v1/messages", { name: m.name, email: m.email, subject: m.subject || "", message: m.message },
            { Prefer: "return=minimal" }).then(function () { return { ok: true }; });
    };

    // ------------------------------------------------------------ accounts
    Store.registerUser = function (u) {
        return raw("POST", "/auth/v1/signup", { email: u.email, password: u.password, data: { name: u.name } }, null).then(function (r) {
            if (r && r.access_token) { clearSession(); }   // we do not log the person in automatically; they go to the login page
            return { ok: true, needsConfirm: !(r && r.access_token) };
        });
    };
    Store.loginUser = function (email, password) {
        return raw("POST", "/auth/v1/token?grant_type=password", { email: email, password: password }, null).then(function (r) {
            var s = setSession(r);
            return raw("POST", "/rest/v1/rpc/is_admin", {}, s.access_token).then(function (isAdmin) {
                raw("POST", "/rest/v1/rpc/touch_login", {}, s.access_token).catch(function () { });
                return { name: s.user.name || email.split("@")[0], email: s.user.email, isAdmin: isAdmin === true };
            });
        });
    };
    // the site-wide login form calls this when the typed name has no "@" (the old "admin" username style)
    Store.adminLogin = function () { return fail("Email or password is wrong"); };
    Store.adminCheck = function () {
        return token().then(function (t) {
            if (!t) return false;
            return raw("POST", "/rest/v1/rpc/is_admin", {}, t).then(function (v) { return v === true; }, function () { return false; });
        });
    };

    // ============================================================ ADMIN (every call is checked by RLS on the server)
    Store.adminProducts = function () {
        return call("GET", "/rest/v1/products?select=*&order=created_at.asc,title.asc").then(function (l) { return (l || []).map(prodOut); });
    };
    function ensureCategory(name) {
        return call("POST", "/rest/v1/categories?on_conflict=name", { name: name }, { Prefer: "resolution=ignore-duplicates,return=minimal" });
    }
    Store.saveProduct = function (p) {
        var err = validateProduct(p); if (err) return fail(err);
        var row = prodIn(p);
        return ensureCategory(row.category).then(function () {
            return p.id ? call("PATCH", "/rest/v1/products?id=eq." + q(p.id), row, { Prefer: "return=representation" })
                        : call("POST", "/rest/v1/products", row, { Prefer: "return=representation" });
        }).then(function (r) { return prodOut((r && r[0]) || row); });
    };
    Store.deleteProduct = function (id) { return call("DELETE", "/rest/v1/products?id=eq." + q(id)).then(function () { return { ok: true }; }); };

    Store.saveCategory = function (c) {
        var name = String(c.name || "").trim();
        if (name.length < 2) return fail("Category name must be at least 2 characters");
        if (c.oldName) {
            return call("PATCH", "/rest/v1/categories?name=eq." + q(c.oldName), { name: name, image: c.image || "" }, { Prefer: "return=minimal" }).then(function () { return { ok: true }; });
        }
        return call("POST", "/rest/v1/categories", { name: name, image: c.image || "" }, { Prefer: "return=minimal" }).then(function () { return { ok: true }; });
    };
    Store.deleteCategory = function (name) { return call("DELETE", "/rest/v1/categories?name=eq." + q(name)).then(function () { return { ok: true }; }); };

    Store.adminOrders = function () {
        return call("GET", "/rest/v1/orders?select=*&order=created_at.asc").then(function (l) { return (l || []).map(orderOut); });
    };
    Store.setOrderStatus = function (id, status) {
        return call("PATCH", "/rest/v1/orders?order_id=eq." + q(id), { status: status }, { Prefer: "return=minimal" }).then(function () { return { ok: true }; });
    };
    Store.deleteOrder = function (id) { return call("DELETE", "/rest/v1/orders?order_id=eq." + q(id)).then(function () { return { ok: true }; }); };
    Store.clearOrders = function () { return call("DELETE", "/rest/v1/orders?order_id=not.is.null").then(function () { return { ok: true }; }); };

    Store.adminMessages = function () {
        return call("GET", "/rest/v1/messages?select=*&order=created_at.asc").then(function (l) { return (l || []).map(msgOut); });
    };
    Store.markMessage = function (id, read) {
        return call("PATCH", "/rest/v1/messages?id=eq." + q(id), { is_read: !!read }, { Prefer: "return=minimal" }).then(function () { return { ok: true }; });
    };
    Store.deleteMessage = function (id) { return call("DELETE", "/rest/v1/messages?id=eq." + q(id)).then(function () { return { ok: true }; }); };
    Store.clearMessages = function () { return call("DELETE", "/rest/v1/messages?id=not.is.null").then(function () { return { ok: true }; }); };

    // every customer who signed up (and when they last logged in)
    Store.adminUsers = function () {
        return call("GET", "/rest/v1/profiles?select=*&order=created_at.asc").then(function (l) {
            return (l || []).map(function (u) { return { id: u.id, name: u.name, email: u.email, joined: u.created_at, lastLogin: u.last_login }; });
        });
    };
    Store.deleteUser = function (id) {
        return call("DELETE", "/rest/v1/profiles?id=eq." + q(id)).then(function () { return { ok: true }; });
    };

    // ------------------------------------------------------------ pictures
    Store.adminImages = function () {
        return call("POST", "/storage/v1/object/list/" + BUCKET, { prefix: "", limit: 200, sortBy: { column: "created_at", order: "desc" } })
            .catch(function () { return []; })
            .then(function (files) {
                var mine = (files || []).filter(function (f) { return f && f.name && /\.(jpe?g|png|webp|gif)$/i.test(f.name); })
                    .map(function (f) { return publicUrl(f.name); });
                return mine.concat(clone(root.SEED.images));
            });
    };
    function publicUrl(name) { return URL_ + "/storage/v1/object/public/" + BUCKET + "/" + q(name).replace(/%2F/g, "/"); }

    function compressImage(file) {   // keep pictures small so the free storage lasts: max 1000px, JPEG
        return new Promise(function (resolve, reject) {
            var url = root.URL.createObjectURL(file), img = new Image();
            img.onload = function () {
                var max = 1000, k = Math.min(1, max / Math.max(img.width, img.height));
                var c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
                root.URL.revokeObjectURL(url);
                c.toBlob(function (b) { b ? resolve(b) : reject(new Error("Could not process the picture")); }, "image/jpeg", 0.82);
            };
            img.onerror = function () { root.URL.revokeObjectURL(url); reject(Object.assign(new Error("bad image"), { userMessage: "This file is not a valid picture" })); };
            img.src = url;
        });
    }
    Store.uploadImage = function (file) {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return fail("Only JPG, PNG, WEBP or GIF pictures are allowed");
        if (file.size > 10 * 1024 * 1024) return fail("Picture must be smaller than 10 MB");
        return Promise.all([compressImage(file), token()]).then(function (r) {
            var name = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + ".jpg";
            if (!r[1]) return fail("Please log in again", 401);
            return fetch(URL_ + "/storage/v1/object/" + BUCKET + "/" + name, {
                method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + r[1], "Content-Type": "image/jpeg", "x-upsert": "false", "cache-control": "max-age=31536000" }, body: r[0]
            }).then(function (res) {
                if (!res.ok) return res.json().catch(function () { return {}; }).then(function (j) {
                    return fail(res.status === 400 || res.status === 403 ? "Upload not allowed. Make sure you are logged in as the admin and the setup SQL was run." : (j.message || "Upload failed"));
                });
                return { path: publicUrl(name) };
            });
        });
    };

    // ------------------------------------------------------------ settings / backup
    Store.saveAdminSettings = function (s) {   // {current, username(ignored), password}
        var sess = getSession(); if (!sess) return fail("Please log in again", 401);
        if (!s.password) return fail("Enter a new password");
        if (s.password.length < 8) return fail("New password must be at least 8 characters");
        // prove the person knows the current password, then change it
        return raw("POST", "/auth/v1/token?grant_type=password", { email: sess.user.email, password: s.current }, null)
            .catch(function () { return fail("Current password is wrong"); })
            .then(function (r) { setSession(r); return raw("PUT", "/auth/v1/user", { password: s.password }, r.access_token); })
            .then(function () { return { ok: true }; });
    };
    Store.resetProducts = function () {
        var S = root.SEED;
        return call("DELETE", "/rest/v1/products?id=not.is.null").then(function () { return call("DELETE", "/rest/v1/categories?name=not.is.null"); })
            .then(function () { return call("POST", "/rest/v1/categories", S.categories.map(function (c) { return { name: c.name, image: c.image }; }), { Prefer: "return=minimal" }); })
            .then(function () {
                return call("POST", "/rest/v1/products", S.products.map(function (p) { return prodIn(p); }), { Prefer: "return=minimal" });
            }).then(function () { return { ok: true }; });
    };
    Store.exportAll = function () {
        return Promise.all([Store.adminProducts(), Store.getCategories(), Store.adminOrders(), Store.adminMessages(), Store.adminUsers()]).then(function (r) {
            return { products: r[0], categories: r[1], orders: r[2], messages: r[3], users: r[4] };
        });
    };

    Store.isLoggedIn = function () { return !!getSession() && !!sessionStorage.getItem("islogin"); };
})(window);
