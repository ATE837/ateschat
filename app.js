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
alert("Kullanıcı bulunamadı")
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

document.getElementById("roomName").innerText=room

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

db.ref("users/"+m.name).once("value",user=>{

let data=user.val()

let div=document.createElement("div")
div.className="msg"

let img=document.createElement("img")
img.src=data.photo || "https://i.imgur.com/4M34hi2.png"

let text=document.createElement("div")
text.innerText=m.name+" : "+m.text

div.appendChild(img)
div.appendChild(text)

document.getElementById("messages").appendChild(div)

document.title="Yeni mesaj 🔔"

})

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
