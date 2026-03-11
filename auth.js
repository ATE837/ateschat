// KAYIT OL

function register(){

let username = document.getElementById("username").value
let password = document.getElementById("password").value

if(username === "" || password === ""){
alert("Kullanıcı adı ve şifre gir")
return
}

firebase.database().ref("users/"+username).once("value",function(snapshot){

if(snapshot.exists()){
alert("Bu kullanıcı adı zaten var")
}else{

firebase.database().ref("users/"+username).set({
username:username,
password:password,
online:false
})

alert("Kayıt başarılı")

}

})

}



// GİRİŞ

function login(){

let username = document.getElementById("username").value
let password = document.getElementById("password").value

firebase.database().ref("users/"+username).once("value",function(snapshot){

if(!snapshot.exists()){
alert("Kullanıcı bulunamadı")
return
}

let data = snapshot.val()

if(data.password !== password){
alert("Şifre yanlış")
return
}

localStorage.setItem("user",username)

document.getElementById("login").style.display="none"
document.getElementById("app").style.display="block"

})

}



function logout(){

localStorage.removeItem("user")
location.reload()

}
