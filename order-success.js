// ==============================
// GET ORDER
// ==============================

let order = JSON.parse(localStorage.getItem("order"));

if (!order) {
    window.location.href = "index.html";
}

// ==============================
// ORDER DETAILS
// ==============================

$("#customer").html(order.customer || "Customer");
$("#payment").html(order.payment);
$("#total").html("Rs. " + order.total);
$("#orderId").html(order.orderId);

// ==============================
// PRODUCTS
// ==============================

let items = "";

order.cart.forEach(function(product){

    items += `
    <div class="item">

        <div class="d-flex align-items-center">

            <img src="${Store.imgSrc(product.Image)}">

            <div class="ms-3">

                <h6>${product.title}</h6>

                <small>

                Qty : ${product.qty}

                </small>

            </div>

        </div>

        <strong>

        Rs. ${product.peice * product.qty}

        </strong>

    </div>
    `;

});

$("#orderedItems").html(items);

// ==============================
// TIMER
// ==============================

const deliveryTime = 30 * 60 * 1000;

if(!order.startTime){

    order.startTime = Date.now();

    localStorage.setItem("order",JSON.stringify(order));

}

function updateTimer(){

    let now = Date.now();

    let end = order.startTime + deliveryTime;

    let left = end - now;

    if(left <= 0){

    $("#timer").html("Delivered");

    $(".step").removeClass("active");

    $(".step").eq(4).addClass("active");

    clearInterval(timer);

    return;
}

    let minutes = Math.floor(left / 60000);

    let seconds = Math.floor((left % 60000)/1000);

    $("#timer").html(

        String(minutes).padStart(2,"0")
        + ":"
        +
        String(seconds).padStart(2,"0")

    );

}

updateTimer();

let timer = setInterval(updateTimer,1000);

// ==============================
// TIMELINE
// ==============================

let current = 0;

function updateSteps(){

    let passed = Date.now() - order.startTime;

    if(passed >= 0) current = 0;

    if(passed >= 7*60*1000) current = 1;

    if(passed >= 14*60*1000) current = 2;

    if(passed >= 21*60*1000) current = 3;

    if(passed >= 30*60*1000){

    current = 4;

    if(window.syncOrderStatuses) syncOrderStatuses();
    localStorage.removeItem("order");

    clearInterval(stepTimer);

}

    $(".step").removeClass("active");

    for(let i=0;i<=current;i++){

        $(".step").eq(i).addClass("active");

    }

}

updateSteps();

let stepTimer = setInterval(updateSteps,1000);



function updateProgress(){

    let passed = Date.now() - order.startTime;

    let percent = Math.floor(
        (passed / (30 * 60 * 1000)) * 100
    );

    if(percent > 100){
        percent = 100;
    }

    $("#progressBar").css("width", percent + "%");
    $("#progressBar").html(percent + "%");

}

updateProgress();

setInterval(updateProgress,1000);


// ==============================
// CANCEL ORDER
// ==============================

$("#cancelOrderBtn").click(function () {

    let confirmCancel = confirm("Are you sure you want to cancel your order?");

    if (confirmCancel) {

        if(window.markOrderCancelled) markOrderCancelled(order.orderId);
        localStorage.removeItem("order");

        alert("❌ Your order has been cancelled successfully!");

        window.location.href = "index.html";

    }

});