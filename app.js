let currentUser=null
let currentRoom="global"

function register(){

let username=document.getElementById("username").value
let password=document.getElementById("password").value
let photo=document.getElementById("photo").value

db.ref("users/"+username).set({

password:password,
photo:photo

})

alert("Kayıt başarılı")

}

function login(){

let username=document.getElementById("username").value
let password=document.getElementById("password").value

db.ref("users/"+username).once("value",snap=>{

let data=snap.val()

if(!data){
alert("Kullanıcı yok")
return
}

if(data.password!=password){
alert("Şifre yanlış")
return
}

currentUser=username

document.getElementById("login").style.display="none"
document.getElementById("app").style.display="block"

loadUsers()
loadMessages()

})

}

function openRoom(room){

currentRoom=room

document.getElementById("messages").innerHTML=""

loadMessages()

}

function send(){

let text=document.getElementById("messageInput").value

db.ref("rooms/"+currentRoom).push({

name:currentUser,
text:text

})

document.getElementById("messageInput").value=""

}

function loadMessages(){

db.ref("rooms/"+currentRoom).on("child_added",snap=>{

let m=snap.val()

let div=document.createElement("div")
div.className="msg"

div.innerText=m.name+" : "+m.text

document.getElementById("messages").appendChild(div)

})

}

function loadUsers(){

db.ref("users").on("value",snap=>{

let users=snap.val()

document.getElementById("users").innerHTML=""

for(let u in users){

let div=document.createElement("div")
div.innerText=u

document.getElementById("users").appendChild(div)

}

})

}

function logout(){

location.reload()

}
