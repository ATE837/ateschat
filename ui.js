auth.onAuthStateChanged(function(user){

let login = document.getElementById("login")
let app = document.getElementById("app")

if(user){

login.style.display="none"
app.style.display="flex"

}else{

login.style.display="flex"
app.style.display="none"

}

})
