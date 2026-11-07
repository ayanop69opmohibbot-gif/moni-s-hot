// Admin panel logic. All data goes through Store (server or browser storage).
(function () {
    "use strict";

    // ------------------------------------------------------------ helpers
    var $ = function (id) { return document.getElementById(id); };
    function esc(v) {
        return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }
    function money(n) { return "Rs. " + (Number(n) || 0).toLocaleString("en-US"); }
    function fmtDate(v) { if (!v) return "-"; var d = new Date(v); return isNaN(d) ? "-" : d.toLocaleString(); }
    function toast(msg, type) {
        var el = document.createElement("div");
        el.className = "alert alert-" + (type || "success");
        el.innerHTML = msg;
        $("toasts").appendChild(el);
        setTimeout(function () { el.remove(); }, 3200);
    }
    function onError(err) { toast(esc((err && err.userMessage) || (err && err.message) || "Something went wrong"), "danger"); }
    function modal(id) { return bootstrap.Modal.getOrCreateInstance($(id)); }

    var STATUSES = ["Order Placed", "Preparing", "Out for Delivery", "Delivered", "Cancelled"];
    var STATUS_CLASS = { "Order Placed": "secondary", "Preparing": "warning", "Out for Delivery": "info", "Delivered": "success", "Cancelled": "danger" };

    var state = { products: [], categories: [], orders: [], messages: [], users: [], images: [] };

    window.logoutAdmin = function () {
        sessionStorage.removeItem("adminLoggedIn");
        sessionStorage.removeItem("adminToken");
        sessionStorage.removeItem("sb_session"); sessionStorage.removeItem("islogin");
        location.href = "login.html";
    };
    Store.onAuthLost = function () { alert("Your session expired. Please log in again."); location.replace("login.html"); };

    // ------------------------------------------------------------ tabs
    function showTab(name) {
        document.querySelectorAll(".panel").forEach(function (p) { p.classList.toggle("active", p.id === "tab-" + name); });
        document.querySelectorAll("#sideNav button").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
        try { history.replaceState(null, "", "#" + name); } catch (e) { }
    }
    $("sideNav").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) showTab(b.dataset.tab); });
    document.addEventListener("click", function (e) {
        var g = e.target.closest("[data-go]");
        if (!g) return;
        showTab(g.dataset.go);
        if (g.dataset.new) openProduct();
    });

    // ------------------------------------------------------------ loading
    function loadAll() {
        return Promise.all([Store.adminProducts(), Store.getCategories(), Store.adminOrders(), Store.adminMessages(), Store.adminUsers(), Store.adminImages()])
            .then(function (r) {
                state.products = r[0]; state.categories = r[1]; state.orders = r[2].slice().reverse();
                state.messages = r[3].slice().reverse(); state.users = r[4]; state.images = r[5];
                renderAll();
            }).catch(onError);
    }
    function renderAll() {
        renderDashboard(); renderProducts(); renderCategories(); renderOrders(); renderCustomers(); renderMessages();
    }

    // ------------------------------------------------------------ dashboard
    function renderDashboard() {
        var sales = 0, pending = 0, done = 0;
        state.orders.forEach(function (o) {
            var s = o.status || "Order Placed";
            if (s !== "Cancelled") sales += Number(o.total) || 0;
            if (s === "Delivered") done++; else if (s !== "Cancelled") pending++;
        });
        var unread = state.messages.filter(function (m) { return !m.read; }).length;
        var stats = [
            ["Products", state.products.length, "fa-utensils"], ["Categories", state.categories.length, "fa-layer-group"],
            ["Total Orders", state.orders.length, "fa-bag-shopping"], ["Total Sales", money(sales), "fa-coins"],
            ["Pending Orders", pending, "fa-hourglass-half"], ["Delivered", done, "fa-circle-check"],
            ["Unread Messages", unread, "fa-envelope"], ["Registered Users", state.users.length, "fa-users"]
        ];
        $("statRow").innerHTML = stats.map(function (s) {
            return '<div class="col-6 col-md-4 col-xl-3"><div class="box stat"><i class="fa-solid ' + s[2] + '"></i><small>' + s[0] + '</small><h3>' + esc(s[1]) + '</h3></div></div>';
        }).join("");

        var recent = state.orders.slice(0, 6);
        $("recentOrders").innerHTML = recent.length ? recent.map(function (o) {
            return '<tr><td><strong>' + esc(o.orderId) + '</strong></td><td>' + esc(o.customer) + '</td><td>' + money(o.total) + '</td><td>' + statusBadge(o.status) + '</td><td><small>' + esc(fmtDate(o.startTime)) + '</small></td></tr>';
        }).join("") : '<tr><td colspan="5" class="empty">No orders yet</td></tr>';

        var pOrders = state.orders.filter(function (o) { var s = o.status || "Order Placed"; return s !== "Delivered" && s !== "Cancelled"; }).length;
        badge($("navOrders"), pOrders); badge($("navMsgs"), unread);
    }
    function badge(el, n) { el.textContent = n; el.style.display = n ? "inline-block" : "none"; }
    function statusBadge(s) { s = s || "Order Placed"; return '<span class="badge text-bg-' + (STATUS_CLASS[s] || "secondary") + '">' + esc(s) + '</span>'; }

    // ------------------------------------------------------------ products
    function renderProducts() {
        var q = $("prodSearch").value.trim().toLowerCase(), cat = $("prodCatFilter").value;
        var catOpts = '<option value="">All categories</option>' + state.categories.map(function (c) {
            return '<option value="' + esc(c.name) + '"' + (c.name === cat ? " selected" : "") + '>' + esc(c.name) + '</option>';
        }).join("");
        if ($("prodCatFilter").innerHTML !== catOpts) $("prodCatFilter").innerHTML = catOpts;

        var list = state.products.filter(function (p) {
            return (!cat || p.category === cat) && (!q || (p.title + " " + p.category).toLowerCase().indexOf(q) > -1);
        });
        $("prodTable").innerHTML = list.length ? list.map(function (p) {
            return '<tr>' +
                '<td><img class="thumb" src="' + esc(Store.imgSrc(p.Image)) + '" alt=""></td>' +
                '<td><strong>' + esc(p.title) + '</strong><div class="text-muted small" style="max-width:360px">' + esc(p.description) + '</div></td>' +
                '<td>' + esc(p.category) + '</td><td><strong>' + money(p.peice) + '</strong></td>' +
                '<td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-act="best" data-id="' + esc(p.id) + '"' + (p.bestSeller ? " checked" : "") + '></div></td>' +
                '<td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-act="avail" data-id="' + esc(p.id) + '"' + (p.available !== false ? " checked" : "") + '></div></td>' +
                '<td><div class="d-flex gap-2"><button class="btn btn-sm btn-outline-dark" data-act="edit" data-id="' + esc(p.id) + '"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="btn btn-sm btn-outline-danger" data-act="del" data-id="' + esc(p.id) + '"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
        }).join("") : '<tr><td colspan="7" class="empty">No products found. Click "Add Product" to create your first one.</td></tr>';
    }
    $("prodSearch").addEventListener("input", renderProducts);
    $("prodCatFilter").addEventListener("change", renderProducts);

    $("prodTable").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-act]"); if (!b) return;
        var p = state.products.find(function (x) { return x.id === b.dataset.id; }); if (!p) return;
        if (b.dataset.act === "edit") openProduct(p);
        if (b.dataset.act === "del") {
            if (!confirm('Delete "' + p.title + '"? Customers will no longer see it.')) return;
            Store.deleteProduct(p.id).then(function () { toast("Product deleted"); return loadAll(); }).catch(onError);
        }
    });
    $("prodTable").addEventListener("change", function (e) {
        var c = e.target.closest("input[data-act]"); if (!c) return;
        var p = state.products.find(function (x) { return x.id === c.dataset.id; }); if (!p) return;
        var copy = Object.assign({}, p);
        if (c.dataset.act === "best") copy.bestSeller = c.checked; else copy.available = c.checked;
        Store.saveProduct(copy).then(function () { toast(c.dataset.act === "best" ? "Best seller updated" : (c.checked ? "Product is now visible" : "Product hidden from website")); return loadAll(); })
            .catch(function (err) { onError(err); loadAll(); });
    });

    // ----- product form
    function fillCategorySelect(selected) {
        var names = state.categories.map(function (c) { return c.name; });
        state.products.forEach(function (p) { if (names.indexOf(p.category) < 0) names.push(p.category); });
        $("pCategory").innerHTML = '<option value="">Select category</option>' +
            names.map(function (n) { return '<option value="' + esc(n) + '"' + (n === selected ? " selected" : "") + '>' + esc(n) + '</option>'; }).join("") +
            '<option value="__new">+ New category...</option>';
        $("pNewCategory").classList.add("d-none"); $("pNewCategory").value = "";
    }
    $("pCategory").addEventListener("change", function () {
        var isNew = this.value === "__new";
        $("pNewCategory").classList.toggle("d-none", !isNew);
        if (isNew) $("pNewCategory").focus();
    });

    function drawImageGrid(gridId, selected, onPick) {
        var grid = $(gridId), list = state.images.slice();
        if (selected && list.indexOf(selected) < 0) list.unshift(selected);
        grid.innerHTML = list.map(function (n) {
            return '<img src="' + esc(Store.imgSrc(n)) + '" data-name="' + esc(n) + '" class="' + (n === selected ? "sel" : "") + '" title="' + esc(n) + '">';
        }).join("");
        grid.onclick = function (e) { var i = e.target.closest("img"); if (i) onPick(i.dataset.name); };
    }
    function setProductImage(name) {
        $("pImage").value = name || "";
        $("pImageText").value = name || "";
        var pv = $("pPreview"); pv.src = name ? Store.imgSrc(name) : "";
        pv.style.visibility = name ? "visible" : "hidden";
        drawImageGrid("imgGrid", name, setProductImage);
        $("pImageErr").textContent = "";
    }
    $("pImageText").addEventListener("input", function () {
        $("pImage").value = this.value.trim();
        var pv = $("pPreview"); pv.src = this.value.trim() ? Store.imgSrc(this.value.trim()) : ""; pv.style.visibility = this.value.trim() ? "visible" : "hidden";
    });
    $("pFile").addEventListener("change", function () {
        var f = this.files[0]; if (!f) return;
        $("pImageErr").textContent = "Uploading...";
        Store.uploadImage(f).then(function (r) {
            state.images.unshift(r.path); setProductImage(r.path); toast("Picture uploaded and selected");
        }).catch(function (err) { $("pImageErr").textContent = (err && err.userMessage) || "Upload failed"; });
        this.value = "";
    });

    function invalid(inputId, errId, msg) {
        var i = $(inputId); i.classList.toggle("is-invalid", !!msg); if (errId) $(errId).textContent = msg || "";
        return !msg;
    }
    function openProduct(p) {
        p = p || {};
        $("productModalTitle").textContent = p.id ? "Edit Product" : "Add Product";
        $("pId").value = p.id || ""; $("pTitle").value = p.title || ""; $("pPrice").value = p.peice || "";
        $("pDesc").value = p.description || ""; $("pBest").checked = !!p.bestSeller; $("pAvail").checked = p.available !== false;
        ["pTitle", "pPrice", "pDesc"].forEach(function (i) { $(i).classList.remove("is-invalid"); });
        $("pCategoryErr").textContent = "";
        fillCategorySelect(p.category || "");
        setProductImage(p.Image || "");
        $("uploadHint").textContent = "Click \"Choose File\" to upload a picture from your computer (JPG, PNG, WEBP or GIF). It is added to the picture grid and selected automatically.";
        $("pFile").disabled = false;
        modal("productModal").show();
    }
    $("addProductBtn").addEventListener("click", function () { openProduct(); });
    ["pTitle", "pPrice", "pDesc"].forEach(function (id) {
        $(id).addEventListener("input", function () { this.classList.remove("is-invalid"); });
    });
    ["pCategory", "pNewCategory"].forEach(function (id) {
        $(id).addEventListener("input", function () { $("pCategoryErr").textContent = ""; });
        $(id).addEventListener("change", function () { $("pCategoryErr").textContent = ""; });
    });

    $("productForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var title = $("pTitle").value.trim(), price = Number($("pPrice").value), desc = $("pDesc").value.trim(), img = $("pImage").value.trim();
        var cat = $("pCategory").value === "__new" ? $("pNewCategory").value.trim() : $("pCategory").value;
        var id = $("pId").value;

        var ok = true;
        ok = invalid("pTitle", "pTitleErr", title.length < 3 ? "Enter at least 3 characters" :
            state.products.some(function (p) { return p.id !== id && p.title.toLowerCase() === title.toLowerCase(); }) ? "A product with this name already exists" : "") && ok;
        ok = invalid("pPrice", "pPriceErr", (!isFinite(price) || price < 1 || Math.floor(price) !== price) ? "Enter a whole number of 1 or more" : "") && ok;
        ok = invalid("pDesc", "pDescErr", desc.length < 10 ? "Enter at least 10 characters" : "") && ok;
        $("pCategoryErr").textContent = cat.length < 2 ? "Choose a category (or type a new one, min 2 characters)" : ""; if (cat.length < 2) ok = false;
        $("pImageErr").textContent = img ? "" : "Choose or upload a picture"; if (!img) ok = false;
        if (!ok) return;

        var btn = $("saveProductBtn"); btn.disabled = true;
        Store.saveProduct({ id: id || undefined, title: title, peice: price, category: cat, description: desc, Image: img, bestSeller: $("pBest").checked, available: $("pAvail").checked })
            .then(function () { modal("productModal").hide(); toast(id ? "Product updated" : "Product added - it is now on your website"); return loadAll(); })
            .catch(onError).then(function () { btn.disabled = false; });
    });

    // ------------------------------------------------------------ categories
    function renderCategories() {
        var names = state.categories.slice();
        state.products.forEach(function (p) { if (!names.some(function (c) { return c.name === p.category; })) names.push({ name: p.category, image: "" }); });
        $("catGrid").innerHTML = names.length ? names.map(function (c) {
            var n = state.products.filter(function (p) { return p.category === c.name; });
            var cover = c.image || (n[0] && n[0].Image) || "";
            return '<div class="col-md-6 col-xl-4"><div class="box overflow-hidden h-100">' +
                '<img src="' + esc(cover ? Store.imgSrc(cover) : "") + '" style="width:100%;height:150px;object-fit:cover;background:#eee" alt="">' +
                '<div class="p-3"><div class="d-flex justify-content-between align-items-start"><div><h5 class="fw-bold mb-0">' + esc(c.name) + '</h5><small class="text-muted">' + n.length + ' product' + (n.length === 1 ? "" : "s") + '</small></div>' +
                '<div class="d-flex gap-2"><button class="btn btn-sm btn-outline-dark" data-cedit="' + esc(c.name) + '"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="btn btn-sm btn-outline-danger" data-cdel="' + esc(c.name) + '"><i class="fa-solid fa-trash"></i></button></div></div></div></div></div>';
        }).join("") : '<div class="col-12"><div class="box empty">No categories yet</div></div>';
    }
    function openCategory(c) {
        c = c || {};
        $("categoryModalTitle").textContent = c.name ? "Edit Category" : "Add Category";
        $("cOld").value = c.name || ""; $("cName").value = c.name || ""; $("cImage").value = c.image || "";
        $("cName").classList.remove("is-invalid");
        function pick(n) { pickCategoryImage(n); }
        drawImageGrid("catImgGrid", c.image || "", pick);
        modal("categoryModal").show();
    }
    $("addCategoryBtn").addEventListener("click", function () { openCategory(); });
    function pickCategoryImage(n) { $("cImage").value = n; drawImageGrid("catImgGrid", n, pickCategoryImage); }
    $("cFile").addEventListener("change", function () {
        var f = this.files[0]; if (!f) return;
        $("cFileErr").textContent = "Uploading...";
        Store.uploadImage(f).then(function (r) {
            state.images.unshift(r.path); pickCategoryImage(r.path); $("cFileErr").textContent = ""; toast("Picture uploaded and selected");
        }).catch(function (err) { $("cFileErr").textContent = (err && err.userMessage) || "Upload failed"; });
        this.value = "";
    });
    $("catGrid").addEventListener("click", function (e) {
        var ed = e.target.closest("[data-cedit]"), del = e.target.closest("[data-cdel]");
        if (ed) openCategory(state.categories.find(function (c) { return c.name === ed.dataset.cedit; }) || { name: ed.dataset.cedit, image: "" });
        if (del) {
            if (!confirm('Delete category "' + del.dataset.cdel + '"?')) return;
            Store.deleteCategory(del.dataset.cdel).then(function () { toast("Category deleted"); return loadAll(); }).catch(onError);
        }
    });
    $("categoryForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var name = $("cName").value.trim();
        if (!invalid("cName", "cNameErr", name.length < 2 ? "Enter at least 2 characters" : "")) return;
        Store.saveCategory({ name: name, image: $("cImage").value, oldName: $("cOld").value || undefined })
            .then(function () { modal("categoryModal").hide(); toast("Category saved"); return loadAll(); }).catch(onError);
    });

    // ------------------------------------------------------------ orders
    function renderOrders() {
        var q = $("orderSearch").value.trim().toLowerCase(), st = $("orderStatusFilter").value;
        var list = state.orders.filter(function (o) {
            return (!st || (o.status || "Order Placed") === st) &&
                (!q || (String(o.orderId) + " " + o.customer + " " + o.phone).toLowerCase().indexOf(q) > -1);
        });
        $("orderTable").innerHTML = list.length ? list.map(function (o) {
            var id = esc(o.orderId), cur = o.status || "Order Placed";
            return '<tr><td><strong>' + id + '</strong></td><td>' + esc(o.customer) + '</td><td>' + esc(o.phone) + '</td><td>' + esc(o.city) + '</td>' +
                '<td>' + esc(o.payment) + '</td><td><strong>' + money(o.total) + '</strong></td>' +
                '<td><select class="form-select form-select-sm" data-status="' + id + '" style="min-width:150px">' +
                STATUSES.map(function (s) { return '<option' + (s === cur ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select></td>' +
                '<td><small>' + esc(fmtDate(o.startTime)) + '</small></td>' +
                '<td><div class="d-flex gap-2"><button class="btn btn-sm btn-outline-dark" data-oview="' + id + '">View</button><button class="btn btn-sm btn-outline-danger" data-odel="' + id + '"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
        }).join("") : '<tr><td colspan="9" class="empty">No orders found</td></tr>';
    }
    $("orderSearch").addEventListener("input", renderOrders);
    $("orderStatusFilter").addEventListener("change", renderOrders);
    $("orderTable").addEventListener("change", function (e) {
        var s = e.target.closest("select[data-status]"); if (!s) return;
        Store.setOrderStatus(s.dataset.status, s.value).then(function () { toast("Status updated"); return loadAll(); }).catch(onError);
    });
    $("orderTable").addEventListener("click", function (e) {
        var v = e.target.closest("[data-oview]"), d = e.target.closest("[data-odel]");
        if (v) viewOrder(v.dataset.oview);
        if (d) { if (!confirm("Delete this order?")) return; Store.deleteOrder(d.dataset.odel).then(function () { toast("Order deleted"); return loadAll(); }).catch(onError); }
    });
    function viewOrder(id) {
        var o = state.orders.find(function (x) { return String(x.orderId) === id; }); if (!o) return;
        var rows = (o.cart || []).map(function (p) {
            return '<div class="d-flex justify-content-between align-items-center border-bottom py-2"><div class="d-flex align-items-center gap-3"><img class="thumb" src="' + esc(Store.imgSrc(p.Image)) + '" alt="">' +
                '<div><strong>' + esc(p.title) + '</strong><br><small class="text-muted">Qty: ' + (Number(p.qty) || 1) + ' x ' + money(p.peice) + '</small></div></div><strong>' + money((Number(p.peice) || 0) * (Number(p.qty) || 1)) + '</strong></div>';
        }).join("") || '<p class="text-muted">No items</p>';
        $("orderDetails").innerHTML =
            '<div class="row g-3"><div class="col-md-6"><div class="p-3 rounded" style="background:#faf5ef"><h6 class="fw-bold">Order</h6><div><b>ID:</b> ' + esc(o.orderId) + '</div><div><b>Status:</b> ' + statusBadge(o.status) + '</div><div><b>Date:</b> ' + esc(fmtDate(o.startTime)) + '</div><div><b>Payment:</b> ' + esc(o.payment) + '</div></div></div>' +
            '<div class="col-md-6"><div class="p-3 rounded" style="background:#faf5ef"><h6 class="fw-bold">Customer</h6><div><b>Name:</b> ' + esc(o.customer) + '</div><div><b>Phone:</b> ' + esc(o.phone) + '</div><div><b>Email:</b> ' + esc(o.email) + '</div><div><b>Address:</b> ' + esc(o.address) + ', ' + esc(o.city) + '</div></div></div></div>' +
            '<h6 class="fw-bold mt-4">Items</h6>' + rows + '<div class="text-end fs-5 fw-bold mt-3">Total: <span style="color:var(--ember)">' + money(o.total) + '</span></div>';
        modal("orderModal").show();
    }
    $("clearOrders").addEventListener("click", function () {
        if (!state.orders.length) return toast("There are no orders to delete", "warning");
        if (!confirm("Delete ALL orders? This cannot be undone.")) return;
        Store.clearOrders().then(function () { toast("All orders deleted"); return loadAll(); }).catch(onError);
    });
    $("exportOrders").addEventListener("click", function () {
        if (!state.orders.length) return toast("No orders to export", "warning");
        var q = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
        var lines = [["Order ID", "Date", "Customer", "Phone", "Email", "Address", "City", "Payment", "Items", "Total", "Status"].map(q).join(",")];
        state.orders.forEach(function (o) {
            lines.push([o.orderId, fmtDate(o.startTime), o.customer, o.phone, o.email, o.address, o.city, o.payment,
                (o.cart || []).map(function (p) { return p.qty + " x " + p.title; }).join("; "), o.total, o.status].map(q).join(","));
        });
        download("orders.csv", "text/csv", "﻿" + lines.join("\n"));
    });
    function download(name, type, text) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    // ------------------------------------------------------------ customers
    function renderCustomers() {
        $("userTable").innerHTML = state.users.length ? state.users.map(function (u) {
            return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td><small>' + esc(fmtDate(u.joined)) + '</small></td><td><small>' + (u.lastLogin ? esc(fmtDate(u.lastLogin)) : '-') + '</small></td><td>' + (Store.mode === "supabase" ? '<small class="text-muted">-</small>' : '<button class="btn btn-sm btn-outline-danger" data-udel="' + esc(u.id) + '"><i class="fa-solid fa-trash"></i></button>') + '</td></tr>';
        }).join("") : '<tr><td colspan="5" class="empty">No registered users yet' + (Store.mode === "browser" ? ' (in browser mode only sign-ups made in this browser are listed)' : '') + '</td></tr>';

        var map = {};
        state.orders.forEach(function (o) {
            var key = (o.phone || o.email || o.customer || "").toLowerCase();
            var b = map[key] || (map[key] = { name: o.customer, phone: o.phone, email: o.email, n: 0, spent: 0, last: 0 });
            b.n++; if (o.status !== "Cancelled") b.spent += Number(o.total) || 0; if ((o.startTime || 0) > b.last) b.last = o.startTime;
        });
        var buyers = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.spent - a.spent; });
        $("buyerTable").innerHTML = buyers.length ? buyers.map(function (b) {
            return '<tr><td><strong>' + esc(b.name) + '</strong></td><td>' + esc(b.phone) + '</td><td>' + esc(b.email) + '</td><td>' + b.n + '</td><td>' + money(b.spent) + '</td><td><small>' + esc(fmtDate(b.last)) + '</small></td></tr>';
        }).join("") : '<tr><td colspan="6" class="empty">No orders yet</td></tr>';
    }
    $("userTable").addEventListener("click", function (e) {
        var d = e.target.closest("[data-udel]"); if (!d) return;
        if (!confirm("Delete this user account?")) return;
        Store.deleteUser(d.dataset.udel).then(function () { toast("User deleted"); return loadAll(); }).catch(onError);
    });

    // ------------------------------------------------------------ messages
    function renderMessages() {
        $("msgTable").innerHTML = state.messages.length ? state.messages.map(function (m) {
            return '<tr class="' + (m.read ? "" : "msg-unread") + '"><td><strong>' + esc(m.name) + '</strong><br><small><a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a></small></td>' +
                '<td>' + esc(m.subject) + '</td><td style="max-width:420px;white-space:pre-wrap">' + esc(m.message) + '</td><td><small>' + esc(fmtDate(m.date)) + '</small></td>' +
                '<td><div class="d-flex gap-2">' + (m.read ? "" : '<button class="btn btn-sm btn-outline-success" data-mread="' + esc(m.id) + '">Mark read</button>') +
                '<button class="btn btn-sm btn-outline-danger" data-mdel="' + esc(m.id) + '"><i class="fa-solid fa-trash"></i></button></div></td></tr>';
        }).join("") : '<tr><td colspan="5" class="empty">No messages yet</td></tr>';
    }
    $("msgTable").addEventListener("click", function (e) {
        var r = e.target.closest("[data-mread]"), d = e.target.closest("[data-mdel]");
        if (r) Store.markMessage(r.dataset.mread, true).then(loadAll).catch(onError);
        if (d) { if (!confirm("Delete this message?")) return; Store.deleteMessage(d.dataset.mdel).then(function () { toast("Message deleted"); return loadAll(); }).catch(onError); }
    });
    $("clearMsgs").addEventListener("click", function () {
        if (!state.messages.length) return toast("There are no messages to delete", "warning");
        if (!confirm("Delete ALL messages?")) return;
        Store.clearMessages().then(function () { toast("All messages deleted"); return loadAll(); }).catch(onError);
    });

    // ------------------------------------------------------------ settings
    $("settingsForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var cur = $("setCurrent").value, user = $("setUser").value.trim(), pw = $("setNew").value, cf = $("setConfirm").value, err = $("setError");
        err.textContent = "";
        if (!cur) return err.textContent = "Enter your current password";
        if (Store.mode !== "supabase" && user.length < 3) return err.textContent = "Username must be at least 3 characters";
        if (pw && pw.length < 6) return err.textContent = "New password must be at least 6 characters";
        if (pw !== cf) return err.textContent = "New password and confirmation do not match";
        Store.saveAdminSettings({ current: cur, username: user, password: pw }).then(function () {
            toast("Login details saved"); $("setCurrent").value = $("setNew").value = $("setConfirm").value = "";
        }.bind(this)).catch(function (er) { err.textContent = (er && er.userMessage) || "Could not save"; });
    });
    $("backupBtn").addEventListener("click", function () {
        Store.exportAll().then(function (d) { download("moni-hot-backup-" + new Date().toISOString().slice(0, 10) + ".json", "application/json", JSON.stringify(d, null, 2)); }).catch(onError);
    });
    $("resetBtn").addEventListener("click", function () {
        if (!confirm("Replace ALL products and categories with the original defaults?")) return;
        Store.resetProducts().then(function () { toast("Menu reset"); return loadAll(); }).catch(onError);
    });

    // ------------------------------------------------------------ start
    Store.ready.then(function () {
        var sb = Store.mode === "supabase", server = Store.mode === "server" || sb;
        if (sb) { $("setUser").closest(".mb-3").style.display = "none"; $("setUser").value = "admin"; }
        $("modePill").className = "mode-pill " + (server ? "mode-server" : "mode-browser");
        $("modePill").innerHTML = server ? '<i class="fa-solid fa-circle me-1" style="font-size:.5rem"></i>Live (' + (sb ? 'Supabase' : 'server') + ')' : '<i class="fa-solid fa-triangle-exclamation me-1"></i>Browser mode';
        if (!server) {
            $("modeNote").innerHTML = '<div class="alert alert-warning mb-0"><b>Browser mode:</b> changes are saved only in this browser, so your visitors will not see them. ' +
                'To publish changes to everyone, run the site with <code>node server.js</code> (see README.md) or host it on a Node server.</div>';
        }
        return Store.adminCheck();
    }).then(function (ok) {
        if (!ok) return Store.onAuthLost();
        var tab = (location.hash || "").replace("#", "");
        if (["dashboard", "products", "categories", "orders", "customers", "messages", "settings"].indexOf(tab) > -1) showTab(tab);
        return loadAll();
    });

    // keep orders fresh while the panel is open
    setInterval(function () {
        if (document.hidden || document.querySelector(".modal.show")) return;
        Promise.all([Store.adminOrders(), Store.adminMessages()]).then(function (r) {
            var o = r[0].slice().reverse(), m = r[1].slice().reverse();
            if (JSON.stringify(o) !== JSON.stringify(state.orders) || JSON.stringify(m) !== JSON.stringify(state.messages)) {
                state.orders = o; state.messages = m; renderDashboard(); renderOrders(); renderCustomers(); renderMessages();
            }
        }).catch(function () { });
    }, 8000);
})();
