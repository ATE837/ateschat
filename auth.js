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
