firebase.auth().onAuthStateChanged(function(user){

if(user){

document.getElementById("login").style.display="none"
document.getElementById("app").style.display="flex"

}else{

document.getElementById("login").style.display="flex"
document.getElementById("app").style.display="none"

}

})
