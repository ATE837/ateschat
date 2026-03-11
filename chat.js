function sendMessage(){

let msg=document.getElementById("messageInput").value
let user=firebase.auth().currentUser

firebase.database().ref("users/"+user.uid).once("value").then(data=>{

let username=data.val().username

firebase.database().ref("messages").push({

user:username,
text:msg

})

})

document.getElementById("messageInput").value=""

}

function loadMessages(){

firebase.database().ref("messages").on("child_added",data=>{

let msg=data.val()

let div=document.createElement("div")
div.className="message"

div.innerHTML="<b>"+msg.user+"</b>: "+msg.text

document.getElementById("messages").appendChild(div)

})

}
