// SAYFA AÇILINCA

window.onload = function(){

let user = localStorage.getItem("user")

if(user){

document.getElementById("login").style.display = "none"
document.getElementById("app").style.display = "block"

}else{

document.getElementById("login").style.display = "flex"
document.getElementById("app").style.display = "none"

}

}
