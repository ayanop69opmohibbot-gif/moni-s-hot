// only logged-in customers can check out
if(!sessionStorage.getItem("islogin")){
    try{sessionStorage.setItem("afterLogin","add to card.html");}catch(e){}
    window.location.replace("login.html");
}
let cart=[];
try{cart=JSON.parse(localStorage.getItem("cart"))||[];}catch(e){cart=[];}
if(!Array.isArray(cart)) cart=[];
cart=cart.filter(function(p){
    return p&&p.title&&Number(p.peice)>0&&parseInt(p.qty,10)>=1;
});
let cards="";
let total=0;

if(cart.length===0){
    cards=`<div class="text-center py-4"><h5>Your Cart is Empty 🛒</h5><a href="index.html" class="btn btn-danger mt-3">Continue Shopping</a></div>`;
}else{
    cart.forEach(function(product){
        if(!product.qty) product.qty=1;
        total+=Number(product.peice)*Number(product.qty);
        cards+=`<div class="d-flex justify-content-between align-items-center border-bottom py-3"><div class="d-flex align-items-center"><img src="${Store.imgSrc(product.Image)}" width="70" height="70" class="rounded" style="object-fit:cover;"><div class="ms-3"><h6 class="mb-1">${product.title}</h6><small class="text-muted">Qty : ${product.qty}</small></div></div><strong class="text-danger">Rs. ${Number(product.peice)*Number(product.qty)}</strong></div>`;
    });
}

document.getElementById("checkoutItems").innerHTML=cards;
document.getElementById("subtotal").innerHTML="Rs. "+total;
document.getElementById("total").innerHTML="Rs. "+total;

let paymentButtons=document.querySelectorAll(".payment");
let cardBox=document.getElementById("cardBox");
let jazzBox=document.getElementById("jazzBox");
let easyBox=document.getElementById("easyBox");

paymentButtons.forEach(function(item){
    item.addEventListener("change",function(){
        cardBox.style.display="none";
        jazzBox.style.display="none";
        easyBox.style.display="none";
        if(this.value=="card") cardBox.style.display="block";
        if(this.value=="jazz") jazzBox.style.display="block";
        if(this.value=="easy") easyBox.style.display="block";
    });
});

function placeOrder(){
    let name=$("#name").val().trim();
    let email=$("#email").val().trim();
    let phone=$("#phone").val().trim();
    let address=$("#address").val().trim();
    let city=$("#city").val();
    let terms=$("#terms").is(":checked");
    let payment=$("input[name='payment']:checked").val();
    let valid=true;

    $(".text-danger").html("");
    $("input,textarea,select").removeClass("is-valid is-invalid");

    if(cart.length===0){
        alert("Your cart is empty!");
        return;
    }

    if(name.length<3){
        $("#name").addClass("is-invalid");
        $("#nameError").html("Enter Full Name (min 3 letters)");
        valid=false;
    }else $("#name").addClass("is-valid");

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        $("#email").addClass("is-invalid");
        $("#emailError").html("Enter a valid Email");
        valid=false;
    }else $("#email").addClass("is-valid");

    if(!/^03\d{2}-?\d{7}$/.test(phone)){
        $("#phone").addClass("is-invalid");
        $("#phoneError").html("Enter valid phone (03XX-XXXXXXX)");
        valid=false;
    }else $("#phone").addClass("is-valid");

    if(address.length<10){
        $("#address").addClass("is-invalid");
        $("#addressError").html("Enter complete address (min 10 characters)");
        valid=false;
    }else $("#address").addClass("is-valid");

    if(city==""){
        $("#city").addClass("is-invalid");
        $("#cityError").html("Select Your City");
        valid=false;
    }else $("#city").addClass("is-valid");

    if(!terms){
        alert("Please Accept Terms & Conditions");
        valid=false;
    }

    if(!payment){
        alert("Please Select Payment Method");
        valid=false;
    }

    if(payment=="card"){
        let cardName=$("#cardName").val().trim();
        let cardNumber=$("#cardNumber").val().trim();
        let expiry=$("#expiry").val().trim();
        let cvv=$("#cvv").val().trim();

        $("#cardNameError,#cardNumberError,#expiryError,#cvvError").html("");
        $("#cardName,#cardNumber,#expiry,#cvv").removeClass("is-valid is-invalid");

        if(cardName==""){
            $("#cardName").addClass("is-invalid");
            $("#cardNameError").html("Enter Card Holder Name");
            valid=false;
        }else $("#cardName").addClass("is-valid");

        if(cardNumber==""||cardNumber.length!=16||isNaN(cardNumber)){
            $("#cardNumber").addClass("is-invalid");
            $("#cardNumberError").html("Enter 16 Digit Card Number");
            valid=false;
        }else $("#cardNumber").addClass("is-valid");

        if(expiry==""){
            $("#expiry").addClass("is-invalid");
            $("#expiryError").html("Enter Expiry");
            valid=false;
        }else $("#expiry").addClass("is-valid");

        if(cvv==""||cvv.length!=3||isNaN(cvv)){
            $("#cvv").addClass("is-invalid");
            $("#cvvError").html("Enter 3 Digit CVV");
            valid=false;
        }else $("#cvv").addClass("is-valid");
    }

    if(payment=="jazz"){
        let jazzNumber=$("#jazzNumber").val().trim();
        let jazzCnic=$("#jazzCnic").val().trim();

        $("#jazzNumberError,#jazzCnicError").html("");
        $("#jazzNumber,#jazzCnic").removeClass("is-valid is-invalid");

        if(jazzNumber==""){
            $("#jazzNumber").addClass("is-invalid");
            $("#jazzNumberError").html("Enter JazzCash Number");
            valid=false;
        }else $("#jazzNumber").addClass("is-valid");

        if(jazzCnic==""){
            $("#jazzCnic").addClass("is-invalid");
            $("#jazzCnicError").html("Enter CNIC");
            valid=false;
        }else $("#jazzCnic").addClass("is-valid");
    }

    if(payment=="easy"){
        let easyNumber=$("#easyNumber").val().trim();
        let easyCnic=$("#easyCnic").val().trim();

        $("#easyNumberError,#easyCnicError").html("");
        $("#easyNumber,#easyCnic").removeClass("is-valid is-invalid");

        if(easyNumber==""){
            $("#easyNumber").addClass("is-invalid");
            $("#easyNumberError").html("Enter EasyPaisa Number");
            valid=false;
        }else $("#easyNumber").addClass("is-valid");

        if(easyCnic==""){
            $("#easyCnic").addClass("is-invalid");
            $("#easyCnicError").html("Enter CNIC");
            valid=false;
        }else $("#easyCnic").addClass("is-valid");
    }

    if(!valid) return;

    let orderId="MH-"+Date.now()+"-"+Math.floor(Math.random()*1000);

    let order={
        orderId:orderId,
        customer:name,
        email:email,
        phone:phone,
        address:address,
        city:city,
        payment:payment,
        total:total,
        cart:cart.map(function(product){
            return{
                Image:product.Image,
                title:product.title,
                peice:Number(product.peice),
                qty:Number(product.qty)
            };
        }),
        status:"Order Placed",
        startTime:Date.now()
    };

    let btn=document.querySelector("button[onclick='placeOrder()']");
    if(btn){ btn.disabled=true; }

    Store.addOrder(order).then(function(saved){
        // the server returns the final order (real prices + id); keep it for the tracking page
        localStorage.setItem("order",JSON.stringify(saved||order));
        localStorage.removeItem("cart");
        window.location.href="order-success.html";
    }).catch(function(error){
        console.error(error);
        if(btn){ btn.disabled=false; }
        if(error&&error.status===401){
            alert("Please log in again to place your order.");
            sessionStorage.removeItem("islogin");
            try{sessionStorage.setItem("afterLogin","add to card.html");}catch(e){}
            window.location.href="login.html";
            return;
        }
        alert((error&&error.userMessage)||"Order could not be placed. Please try again.");
    });
}
