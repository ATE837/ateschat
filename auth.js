let currentUser=null

function register(){

let u=username.value
let p=password.value
let photoUrl=photo.value

db.ref("users/"+u).once("value",snap=>{

if(snap.exists()){
alert("Bu kullanıcı adı kullanılıyor")
return
}

db.ref("users/"+u).set({

password:p,
photo:photoUrl,
role:"user"

})

alert("Kayıt başarılı")

})

}


function login(){

let u=username.value
let p=password.value

db.ref("users/"+u).once("value",snap=>{

let data=snap.val()

if(!data){
alert("Kullanıcı yok")
return
}

if(data.password!=p){
alert("Şifre yanlış")
return
}

currentUser=u

login.style.display="none"
app.style.display="block"

loadUsers()
loadMessages()

})

}


function logout(){

location.reload()

}
