var MAX_QTY = 10;   // maximum quantity allowed per product
// products & categories are loaded from Store (server or browser storage) at the bottom of this file
var products = [];
var categories = [];
var categoryList = [];

let cart = [];



function productCard(product, withOrderBtn){
    var q = esc(product.title);
    return `<div class="col-12 col-sm-6 col-lg-4 mb-4">
        <div class="card shadow h-100">
            <img src="${esc(Store.imgSrc(product.Image))}" class="card-img-top" alt="${q}">
            <div class="card-body">
                <h4>${q}</h4>
                <p>${esc(product.description)}</p>
                <h5>Rs. ${Number(product.peice)}</h5>
                <div class="d-grid gap-2 mt-3">
                    <a href="detail.html?id=${encodeURIComponent(product.id)}" class="btn btn-outline-dark rounded-pill">
                        <i class="fa-solid fa-eye me-2"></i>View Details
                    </a>
                    ${withOrderBtn ? `<button data-title="${q}" onclick="addToCart(this.dataset.title)" class="btn btn-danger w-100 rounded-pill">Order Now</button>` : ""}
                </div>
                ${product.bestSeller ? `<span class="badge bg-warning text-dark mb-2">Best Seller</span>` : ""}
            </div>
        </div>
    </div>`;
}

function renderStorefront(){
    // ---- menu on home page
    var container = document.getElementById("cardContainer");
    if(container && !document.getElementById("detailPageDesign")){
        container.innerHTML = products.length
            ? products.map(function(p){ return productCard(p, true); }).join("")
            : '<div class="col-12 text-center text-muted py-5">No products available right now. Please check back soon.</div>';
    }

    // ---- category cards on home page
    var listing = document.getElementById("CategoryListing");
    if(listing){
        var used = [];
        // every category added in the admin panel (even a new, still empty one) + any category products use
        categoryList.forEach(function(c){ if(c.name && used.indexOf(c.name) < 0) used.push(c.name); });
        products.forEach(function(p){ if(used.indexOf(p.category) < 0) used.push(p.category); });
        listing.innerHTML = used.map(function(name){
            var meta = categoryList.find(function(c){ return c.name === name; }) || {};
            var cover = meta.image || (products.find(function(p){ return p.category === name; }) || {}).Image || "";
            return `
            <div class="cat-slide">
                <div class="card border-0 shadow-lg rounded-4 text-center h-100">
                    <img src="${esc(Store.imgSrc(cover))}" class="card-img-top rounded-top" style="height:220px; object-fit:cover;">
                    <div class="card-body">
                        <span class="badge bg-danger mb-3 px-3 py-2">BBQ</span>
                        <h4 class="fw-bold">${esc(name)}</h4>
                        <p class="text-muted">Discover our delicious ${esc(name)} made with premium ingredients.</p>
                        <a href="category.html?category=${encodeURIComponent(name)}" class="btn btn-dark rounded-pill px-4">Explore</a>
                    </div>
                </div>
            </div>`;
        }).join("");

        // slider: arrows scroll one card at a time, swipe works on phones
        var prev = document.getElementById("catPrev"), next = document.getElementById("catNext");
        function catStep(dir){ var w = listing.firstElementChild ? listing.firstElementChild.getBoundingClientRect().width + 24 : 300; listing.scrollBy({left: dir * w, behavior: "smooth"}); }
        function catArrows(){
            var more = listing.scrollWidth > listing.clientWidth + 4;
            prev.style.display = next.style.display = more ? "" : "none";
            prev.disabled = listing.scrollLeft <= 4;
            next.disabled = listing.scrollLeft + listing.clientWidth >= listing.scrollWidth - 4;
        }
        if(prev && next){
            prev.onclick = function(){ catStep(-1); };
            next.onclick = function(){ catStep(1); };
            listing.addEventListener("scroll", catArrows);
            window.addEventListener("resize", catArrows);
            catArrows();
        }
    }

    // ---- product detail page
    var detailBox = document.getElementById("detailPageDesign");
    if(detailBox){
        var id = new URLSearchParams(location.search).get("id");
        var item = products.find(function(p){ return p.id === id; });
        if(!item){
            detailBox.innerHTML = `
            <div class="container py-5 text-center">
                <div style="font-size:3rem">🍽️</div>
                <h3 class="fw-bold mt-2">Sorry, this product is not available.</h3>
                <a href="index.html" class="btn btn-danger rounded-pill px-4 mt-3">Back to Menu</a>
            </div>`;
        }else{
            document.title = item.title + " | Moni's Hot";
            var q = esc(item.title);
            detailBox.innerHTML = `
            <section class="pd-wrap">
              <div class="container">
                <nav class="pd-crumbs">
                    <a href="index.html">Home</a><i class="fa-solid fa-chevron-right"></i>
                    <a href="category.html?category=${encodeURIComponent(item.category)}">${esc(item.category)}</a><i class="fa-solid fa-chevron-right"></i>
                    <span>${q}</span>
                </nav>

                <div class="pd-card">
                    <div class="row g-0">
                        <div class="col-lg-6">
                            <div class="pd-media">
                                <img src="${esc(Store.imgSrc(item.Image))}" alt="${q}">
                                ${item.bestSeller ? '<span class="pd-badge"><i class="fa-solid fa-fire"></i> Best Seller</span>' : ''}
                            </div>
                        </div>

                        <div class="col-lg-6">
                            <div class="pd-info">
                                <a class="pd-cat" href="category.html?category=${encodeURIComponent(item.category)}">${esc(item.category)}</a>
                                <h1 class="pd-title">${q}</h1>
                                <div class="pd-stars" aria-label="Rated 5 out of 5">
                                    <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i>
                                    <span>Customer favourite</span>
                                </div>
                                <p class="pd-desc">${esc(item.description)}</p>

                                <div class="pd-price-row">
                                    <div class="pd-price">Rs. ${Number(item.peice)}</div>
                                    <span class="pd-stock"><i class="fa-solid fa-circle-check"></i> Available now</span>
                                </div>

                                <div class="pd-buy">
                                    <div class="pd-qty">
                                        <button type="button" id="pdMinus" aria-label="Decrease quantity">&minus;</button>
                                        <input type="number" id="pdQty" value="1" min="1" max="${MAX_QTY}" aria-label="Quantity">
                                        <button type="button" id="pdPlus" aria-label="Increase quantity">+</button>
                                    </div>
                                    <button class="pd-add" id="pdAdd" data-title="${q}"><i class="fa-solid fa-cart-plus"></i> Add to Cart</button>
                                </div>
                                <div class="pd-total">Total: <b id="pdTotal">Rs. ${Number(item.peice)}</b></div>
                                <div id="pdLoginNote" class="pd-note" style="display:none"><i class="fa-solid fa-lock"></i> Please <a href="login.html" id="pdLoginLink">log in</a> to place an order.</div>

                                <ul class="pd-perks">
                                    <li><i class="fa-solid fa-truck-fast"></i><span><b>Free delivery</b><small>Across Karachi</small></span></li>
                                    <li><i class="fa-solid fa-fire-flame-curved"></i><span><b>Charcoal grilled</b><small>Cooked fresh to order</small></span></li>
                                    <li><i class="fa-solid fa-wallet"></i><span><b>Easy payment</b><small>COD, card, JazzCash, EasyPaisa</small></span></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="relatedBox"></div>
              </div>
            </section>`;

            // quantity controls
            var qtyInput = document.getElementById("pdQty");
            function clampQty(){
                var n = parseInt(qtyInput.value, 10);
                if(!(n >= 1)) n = 1;
                if(n > MAX_QTY){ n = MAX_QTY; showToast("Maximum " + MAX_QTY + " per item allowed.", "warning"); }
                qtyInput.value = n;
                document.getElementById("pdTotal").textContent = "Rs. " + (n * Number(item.peice));
                return n;
            }
            document.getElementById("pdMinus").onclick = function(){ qtyInput.value = Math.max(1, (parseInt(qtyInput.value,10)||1) - 1); clampQty(); };
            document.getElementById("pdPlus").onclick  = function(){ qtyInput.value = (parseInt(qtyInput.value,10)||0) + 1; clampQty(); };
            qtyInput.addEventListener("change", clampQty);
            document.getElementById("pdAdd").onclick = function(){
                var ok = addToCart(this.dataset.title, clampQty());
                if(ok){
                    var btn = this; var old = btn.innerHTML;
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> Added!'; btn.classList.add("done");
                    setTimeout(function(){ btn.innerHTML = old; btn.classList.remove("done"); }, 1400);
                }
            };
            if(!Store.isLoggedIn()){
                document.getElementById("pdLoginNote").style.display = "block";
                document.getElementById("pdLoginLink").onclick = function(){ try{ sessionStorage.setItem("afterLogin", location.pathname.split("/").pop() + location.search); }catch(e){} };
            }

            // related products
            var related = products.filter(function(p){ return p.category === item.category && p.id !== item.id; });
            if(related.length < 3){
                products.forEach(function(p){ if(p.id !== item.id && related.indexOf(p) < 0 && related.length < 3) related.push(p); });
            }
            related = related.slice(0, 3);
            if(related.length){
                document.getElementById("relatedBox").innerHTML = `
                    <h3 class="pd-related-title">You may also like</h3>
                    <div class="row">${related.map(function(p){ return productCard(p, true); }).join("")}</div>`;
            }
        }
    }

    // ---- category page
    var catBox = document.getElementById("categoryProducts");
    if(catBox){
        var category = new URLSearchParams(location.search).get("category");
        var found = products.filter(function(p){ return p.category == category; });
        catBox.innerHTML = found.length
            ? found.map(function(p){ return productCard(p, false); }).join("")
            : '<div class="col-12 text-center text-muted py-5">No products in this category yet.</div>';
    }
}

    // LOGIN
  

function Login (){

    var email = document.getElementById("logemail").value.trim();
    var password = document.getElementById("logpassword").value;

    var emailMsg = document.getElementById("emessage");
    var passMsg = document.getElementById("pmessage");

    emailMsg.innerHTML = "";
    passMsg.innerHTML = "";

    if(email === "" || password === ""){
        if(email === "") emailMsg.innerHTML = "Enter your email";
        if(password === "") passMsg.innerHTML = "Enter your password";
        return;
    }

    // no "@" = could be the admin username. Only the real admin credentials open the admin panel.
    if(email.indexOf("@") < 0){
        Store.adminLogin(email, password).then(function(){
            sessionStorage.setItem("adminLoggedIn", "true");
            location.assign("admin.html");
        }).catch(function(err){
            emailMsg.innerHTML = "Email not match";
            passMsg.innerHTML = (err && err.userMessage) ? err.userMessage : "password not match";
        });
        return;
    }

    Store.loginUser(email, password).then(function(user){
        sessionStorage.setItem("islogin", "email");
        try{ sessionStorage.setItem("userName", user.name || ""); }catch(e){}
        if(user.isAdmin){   // only the owner (listed in the admins table) gets the admin panel
            sessionStorage.setItem("adminLoggedIn", "true");
            location.assign("admin.html");
            return;
        }
        location.assign(Store.afterLoginTarget());
    }).catch(function(err){
        emailMsg.innerHTML = "Email not match";
        passMsg.innerHTML = (err && err.userMessage) ? err.userMessage : "password not match";
    });

}

if(document.getElementById("loginbtn")){

    if(sessionStorage.getItem("islogin")){

        document.getElementById("loginbtn").style.display = "none";
        document.getElementById("logoutbtn").style.display = "inline-block";

    }else{

        document.getElementById("loginbtn").style.display = "flex";
        document.getElementById("logoutbtn").style.display = "none";

    }

}

function Logout(){

    sessionStorage.removeItem("islogin");
    sessionStorage.removeItem("userToken");
    sessionStorage.removeItem("userName");
    sessionStorage.removeItem("sb_session");
    sessionStorage.removeItem("adminLoggedIn");

    location.assign("login.html");

}

   // LOGIN END



 // LOGIN AND SINGIN WITH JQUERY


if(window.jQuery) $(document).ready(function () {

            $("#register").submit(function (event) {
                event.preventDefault();
            
                var name = $("#name").val()
                var email = $("#email").val()
                var password = $("#password").val()

                var error = false;

                if(name != ""){
                    $("#name").removeClass("is-invalid")
                    $("#name").addClass("is-valid")
                    error = true
                } else {
                     $("#name").removeClass("is-valid")
                     $("#name").addClass("is-invalid")
                     error = false
                }

                 if(email != ""){
                    $("#email").removeClass("is-invalid")
                    $("#email").addClass("is-valid")
                    error = true
                } else {
                     $("#email").removeClass("is-valid")
                     $("#email").addClass("is-invalid")
                     error = false
                }

                if(password != ""){
                    $("#password").removeClass("is-invalid")
                    $("#password").addClass("is-valid")
                    error = true
                } else {
                     $("#password").removeClass("is-valid")
                     $("#password").addClass("is-invalid")
                     error = false
                }

                //Now Run Error When Data is True

                if (name != "" && email != "" && password != "") {

                    //Now Adding regular expression 

                    if(name.match(/^[A-z ]{3,18}$/)){
                          $("#name").removeClass("is-invalid")
                          $("#name").addClass("is-valid");
                          $("#namemassage").html("");
                        
                    }else{
                        $("#name").removeClass("is-valid")
                        $("#name").addClass("is-invalid");
                        $("#namemassage").html("Name Must Be Character And Minium 3 character And Maximum 18")
                        $("#namemassage").css("color","red");
                    }

                

                if(email.match(/^[A-z 0-9 \W]+[@][gmail]{5}[.][com]{3}$/)){
                    $("#email").removeClass("is-invalid")
                    $("#email").addClass("is-valid");
                    $("#emassage").html("");

                }else{
                        $("#email").removeClass("is-valid")
                        $("#email").addClass("is-invalid");
                        $("#emassage").html("Email Pattern Not Match")
                        $("#emassage").css("color","red");
                }
                

                if(password.match(/^[A-z  0-9 \W]{6,12}$/)){
                    $("#password").removeClass("is-invalid")
                    $("#password").addClass("is-valid");
                    $("#pmassage").html("");

                }else{
                        $("#password").removeClass("is-valid")
                        $("#password").addClass("is-invalid");
                        $("#pmassage").html("Password Must Be 6 To 12 Characters Length")
                        $("#pmassage").css("color","red");
                }
               
                
                //ab alert wala task


              }

 if(
    name.match(/^[A-z ]{3,18}$/) &&
    email.match(/^[A-z 0-9 \W]+[@][gmail]{5}[.][com]{3}$/) &&
    password.match(/^[A-z  0-9 \W]{6,12}$/)
){
    Store.registerUser({name:name, email:email, password:password}).then(function(){
        alert("Account Created Successfully");
        location.assign("login.html");
    }).catch(function(err){
        $("#email").removeClass("is-valid").addClass("is-invalid");
        $("#emassage").html((err && err.userMessage) || "Could not create account").css("color","red");
    });
}             

            });
        });



 // LOGIN AND SINGIN WITH JQUERY END




       
// ==============================
// CART (add to cart + cart page)
// ==============================


function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch){
        return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];
    });
}

// Reads the cart from localStorage and VALIDATES it:
// - broken / tampered data is thrown away
// - only products that exist in the menu are kept (price always comes from the menu)
// - qty must be a whole number between 1 and MAX_QTY
// - duplicate products are merged
function getCart(){
    let raw;
    try{
        raw = JSON.parse(localStorage.getItem("cart"));
    }catch(e){
        raw = null;
    }
    if(!Array.isArray(raw)) return [];

    let clean = [];
    raw.forEach(function(item){
        if(!item) return;
        let product = products.find(function(p){ return p.title === item.title; });
        let qty = parseInt(item.qty, 10);
        if(!product || isNaN(qty) || qty < 1) return;

        let existing = clean.find(function(c){ return c.title === product.title; });
        if(existing){
            existing.qty = Math.min(MAX_QTY, existing.qty + qty);
        }else{
            clean.push(Object.assign({}, product, { qty: Math.min(qty, MAX_QTY) }));
        }
    });
    return clean;
}

function saveCart(cart){
    try{
        localStorage.setItem("cart", JSON.stringify(cart));
        return true;
    }catch(e){
        return false;
    }
}

// Small toast that works on every page (creates its own element if the page has none)
function showToast(message, type){
    let box = document.getElementById("cartToastBox");
    if(!box){
        box = document.createElement("div");
        box.id = "cartToastBox";
        box.style.cssText = "position:fixed;top:84px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
        document.body.appendChild(box);
    }
    let toast = document.createElement("div");
    toast.className = "alert alert-" + (type || "success") + " shadow mb-0";
    toast.style.cssText = "min-width:240px;max-width:320px;";
    toast.innerHTML = message;
    box.appendChild(toast);
    setTimeout(function(){ toast.remove(); }, 2500);
}

// ADD TO CART
function addToCart(title, qty){
    // only logged-in visitors can order
    if(!Store.isLoggedIn()){
        loginPrompt();
        return false;
    }

    let product = products.find(function(item){
        return item.title === title;
    });

    if(!product){
        showToast("Sorry, this product is not available.", "danger");
        return false;
    }

    qty = parseInt(qty, 10);
    if(!(qty >= 1)) qty = 1;

    let cart = getCart();
    let existing = cart.find(function(item){
        return item.title === title;
    });

    if(existing){
        if(existing.qty >= MAX_QTY){
            showToast("Maximum " + MAX_QTY + " per item allowed.", "warning");
            return false;
        }
        existing.qty = Math.min(MAX_QTY, existing.qty + qty);
    }else{
        cart.push(Object.assign({}, product, { qty: Math.min(MAX_QTY, qty) }));
    }

    if(!saveCart(cart)){
        showToast("Could not save your cart. Please enable browser storage.", "danger");
        return false;
    }

    showToast("<strong>" + esc(title) + "</strong> added to cart 🛒", "success");
    return true;
}

// Friendly "please log in" box (used when a visitor who is not logged in tries to order)
function loginPrompt(){
    var old = document.getElementById("loginPrompt");
    if(old) old.remove();
    var wrap = document.createElement("div");
    wrap.id = "loginPrompt";
    wrap.style.cssText = "position:fixed;inset:0;background:rgba(20,12,8,.6);z-index:10000;display:grid;place-items:center;padding:16px;";
    wrap.innerHTML = `
        <div style="background:var(--card,#fff);color:var(--text,#222);max-width:380px;width:100%;border-radius:20px;padding:30px 26px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.4)">
            <div style="font-size:2.4rem">🔒</div>
            <h4 class="fw-bold mt-2">Please log in to order</h4>
            <p class="text-muted mb-4">You need an account to add items to your cart and place an order.</p>
            <div class="d-grid gap-2">
                <button class="btn btn-danger" id="lpLogin">Log in</button>
                <button class="btn btn-outline-dark" id="lpSignup">Create an account</button>
                <button class="btn btn-link text-muted" id="lpClose">Maybe later</button>
            </div>
        </div>`;
    document.body.appendChild(wrap);
    function remember(){ try{ sessionStorage.setItem("afterLogin", location.pathname.split("/").pop() + location.search); }catch(e){} }
    document.getElementById("lpLogin").onclick = function(){ remember(); location.assign("login.html"); };
    document.getElementById("lpSignup").onclick = function(){ remember(); location.assign("singin.html"); };
    document.getElementById("lpClose").onclick = function(){ wrap.remove(); };
    wrap.addEventListener("click", function(e){ if(e.target === wrap) wrap.remove(); });
}

// ---- CART PAGE ----

function cartMessage(text, type){
    let box = document.getElementById("cartMessage");
    if(!box) return;
    box.innerHTML = text ? '<div class="alert alert-' + (type || "warning") + ' py-2">' + text + '</div>' : "";
}

function renderCart(){
    let holder = document.getElementById("cartItems");
    if(!holder) return;

    let cart = getCart();
    saveCart(cart);               // write back the cleaned cart

    let cards = "";
    let total = 0;

    if(cart.length === 0){
        cards = `
        <div class="text-center py-5">
            <h2>Your Cart is Empty 🛒</h2>
            <a href="index.html" class="btn btn-dark mt-3">
                Continue Shopping
            </a>
        </div>`;
    }else{
        cart.forEach(function(product, index){
            total += product.peice * product.qty;
            cards += `
            <div class="card shadow border-0 rounded-4 mb-4">
                <div class="row g-0">
                    <div class="col-md-4">
                        <img src="${esc(Store.imgSrc(product.Image))}"
                        class="img-fluid rounded-start"
                        style="height:220px;width:100%;object-fit:cover;">
                    </div>
                    <div class="col-md-8">
                        <div class="card-body">
                            <span class="badge bg-danger">${esc(product.category)}</span>
                            <h3 class="mt-2">${esc(product.title)}</h3>
                            <p class="text-muted">${esc(product.description)}</p>
                            <h4 class="text-danger">Rs. ${product.peice * product.qty}</h4>
                            <small class="text-muted">Price : Rs. ${product.peice} × ${product.qty}</small>

                            <div class="d-flex align-items-center gap-2 mt-3">
                                <button class="btn btn-outline-dark" onclick="minusQty(${index})">-</button>
                                <input type="number" min="1" max="${MAX_QTY}" step="1"
                                    value="${product.qty}" id="qty${index}"
                                    class="form-control text-center" style="width:80px"
                                    onchange="setQty(${index}, this.value)">
                                <button class="btn btn-outline-dark" onclick="plusQty(${index})">+</button>
                            </div>

                            <button onclick="removeFromCart(${index})"
                                class="btn btn-outline-danger rounded-pill mt-3">
                                <i class="fa-solid fa-trash"></i> Remove
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        });
    }

    holder.innerHTML = cards;

    let subtotal = document.getElementById("subtotal");
    let totalBox = document.getElementById("total");
    if(subtotal) subtotal.innerHTML = "Rs. " + total;
    if(totalBox) totalBox.innerHTML = "Rs. " + total;

    // Checkout button is disabled while the cart is empty
    let checkoutBtn = document.getElementById("checkoutBtn");
    if(checkoutBtn){
        checkoutBtn.classList.toggle("disabled", cart.length === 0);
        checkoutBtn.setAttribute("aria-disabled", cart.length === 0 ? "true" : "false");
    }
}

function setQty(index, value){
    let cart = getCart();
    if(!cart[index]) return;

    let qty = Number(value);

    if(value === "" || !Number.isInteger(qty) || qty < 1){
        cartMessage("Quantity must be a whole number of 1 or more.", "danger");
    }else if(qty > MAX_QTY){
        cartMessage("You can order a maximum of " + MAX_QTY + " of each item.", "warning");
        cart[index].qty = MAX_QTY;
        saveCart(cart);
    }else{
        cartMessage("");
        cart[index].qty = qty;
        saveCart(cart);
    }
    renderCart();
}

function plusQty(index){
    let cart = getCart();
    if(!cart[index]) return;
    if(cart[index].qty >= MAX_QTY){
        cartMessage("You can order a maximum of " + MAX_QTY + " of each item.", "warning");
        return;
    }
    cartMessage("");
    cart[index].qty++;
    saveCart(cart);
    renderCart();
}

function minusQty(index){
    let cart = getCart();
    if(!cart[index]) return;
    if(cart[index].qty <= 1){
        cartMessage("Minimum quantity is 1. Use Remove to delete the item.", "warning");
        return;
    }
    cartMessage("");
    cart[index].qty--;
    saveCart(cart);
    renderCart();
}

function removeFromCart(index){
    let cart = getCart();
    if(!cart[index]) return;
    cart.splice(index, 1);
    saveCart(cart);
    cartMessage("");
    renderCart();
}

// Validate cart again right before going to checkout
function goToCheckout(event){
    if(!Store.isLoggedIn()){
        event.preventDefault();
        loginPrompt();
        return false;
    }
    if(getCart().length === 0){
        event.preventDefault();
        cartMessage("Your cart is empty. Please add at least one item before checkout.", "danger");
        return false;
    }
    return true;
}

//add to card end

// dark mode end




// ==============================
// TRACK ORDER BANNER
// ==============================

function checkActiveOrder() {

    if (!document.getElementById("trackOrderBox")) return;

    let order = null;
    try { order = JSON.parse(localStorage.getItem("order")); } catch (e) {}

    if (!order) {

        document.getElementById("trackOrderBox").style.display="none";
        return;

    }

    let deliveryTime = 30 * 60 * 1000;

    let endTime = order.startTime + deliveryTime;

    if (Date.now() >= endTime) {

        if (window.syncOrderStatuses) syncOrderStatuses();

        localStorage.removeItem("order");

        document.getElementById("trackOrderBox").style.display="none";

    } else {

        document.getElementById("trackOrderBox").style.display="block";

    }

}

// Run immediately
checkActiveOrder();

// Check every second
setInterval(checkActiveOrder, 1000);


// SEARCH (plain JS)
(function(){
    var box=document.getElementById("search");
    if(!box) return;
    box.addEventListener("input",function(){
        var v=box.value.toLowerCase();
        document.querySelectorAll("#cardContainer > div").forEach(function(c){
            c.style.display=c.textContent.toLowerCase().indexOf(v)>-1?"":"none";
        });
    });
})();


// ==============================
// LOAD DATA, THEN DRAW THE PAGE
// ==============================
Store.ready.then(function(){
    return Promise.all([Store.getProducts(), Store.getCategories()]);
}).then(function(result){
    products = result[0] || [];
    categoryList = result[1] || [];
    renderStorefront();
    renderCart();
}).catch(function(err){
    console.error(err);
    var box = document.getElementById("cardContainer") || document.getElementById("categoryProducts") || document.getElementById("cartItems");
    if(box) box.innerHTML = '<div class="col-12 text-center text-danger py-5">Could not load the menu. Please refresh the page.</div>';
});
