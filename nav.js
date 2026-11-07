/* Dark mode + login buttons — runs on every page, no jQuery needed */
(function(){
  var KEY="theme";
  function saved(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } }
  function save(dark){ try{ if(dark) localStorage.setItem(KEY,"dark"); else localStorage.removeItem(KEY); }catch(e){} }
  var btn=document.getElementById("themeBtn");
  function paint(){
    var dark=document.body.classList.contains("dark-mode");
    if(btn){ btn.textContent=dark?"☀️":"🌙"; btn.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode"); btn.title=btn.getAttribute("aria-label"); }
  }
  if(saved()==="dark") document.body.classList.add("dark-mode");
  paint();
  if(btn) btn.addEventListener("click",function(){
    save(document.body.classList.toggle("dark-mode"));
    paint();
  });

  var logged=null; try{ logged=sessionStorage.getItem("islogin"); }catch(e){}
  var li=document.getElementById("loginbtn"), lo=document.getElementById("logoutbtn");
  if(li) li.style.display=logged?"none":"flex";
  if(lo) lo.style.display=logged?"inline-block":"none";
  if(typeof window.Logout!=="function") window.Logout=function(){ try{sessionStorage.removeItem("islogin");sessionStorage.removeItem("userToken");sessionStorage.removeItem("sb_session");sessionStorage.removeItem("adminLoggedIn");}catch(e){} location.assign("login.html"); };
})();
