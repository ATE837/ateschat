import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"

import {
getAuth,
createUserWithEmailAndPassword,
signInWithEmailAndPassword,
onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"

import {
getDatabase,
ref,
push,
set,
onChildAdded
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js"


const firebaseConfig = {

apiKey: "BURAYA_APIKEY",
authDomain: "BURAYA_AUTHDOMAIN",
databaseURL: "BURAYA_DATABASEURL",
projectId: "BURAYA_PROJECTID",
storageBucket: "BURAYA_STORAGE",
messagingSenderId: "BURAYA_ID",
appId: "BURAYA_APPID"

}

const app = initializeApp(firebaseConfig)

const auth = getAuth(app)

const db = getDatabase(app)

let room="genel"


window.register=function(){

createUserWithEmailAndPassword(auth,email.value,password.value)

.then(()=>{

set(ref(db,"users/"+auth.currentUser.uid),{

name:username.value

})

})

.catch(e=>alert(e.message))

}


window.login=function(){

signInWithEmailAndPassword(auth,email.value,password.value)

.catch(e=>alert(e.message))

}


onAuthStateChanged(auth,(user)=>{

if(user){

loginPage.style.display="none"

chatPage.style.display="flex"

loadMessages()

}

})


window.sendMessage=function(){

push(ref(db,"rooms/"+room),{

user:username.value,
text:messageInput.value,
time:Date.now()

})

messageInput.value=""

}


function loadMessages(){

messages.innerHTML=""

onChildAdded(ref(db,"rooms/"+room),(data)=>{

let m=data.val()

let div=document.createElement("div")

div.className="message"

div.innerHTML="<b>"+m.user+"</b><br>"+m.text

messages.appendChild(div)

})

}


window.changeRoom=function(r){

room=r

loadMessages()

}
