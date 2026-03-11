let room = "global"

function send(){

let user = auth.currentUser.email
let msg = document.getElementById("messageInput").value

if(msg === "") return

db.ref("messages/"+room).push({

user:user,
text:msg,
time:Date.now()

})

document.getElementById("messageInput").value=""

}



db.ref("messages/global").on("child_added",function(snapshot){

let data = snapshot.val()

let box = document.createElement("div")

box.innerText = data.user + " : " + data.text

document.getElementById("messages").appendChild(box)

})
