let room = "global"

function send(){

let input = document.getElementById("messageInput")
let text = input.value

if(text === "") return

let user = firebase.auth().currentUser.email

firebase.database().ref("messages/"+room).push({

user:user,
text:text,
time:Date.now()

})

input.value=""

}


firebase.database().ref("messages/global").on("child_added",function(snapshot){

let data = snapshot.val()

let div = document.createElement("div")
div.style.padding="10px"
div.style.borderBottom="1px solid #333"

div.innerHTML = "<b>"+data.user+"</b>: "+data.text

document.getElementById("messages").appendChild(div)

})
