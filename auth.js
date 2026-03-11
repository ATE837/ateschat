function register(){

let email=document.getElementById("email").value
let pass=document.getElementById("password").value
let username=document.getElementById("username").value

firebase.auth().createUserWithEmailAndPassword(email,pass)
.then(user=>{

firebase.database().ref("users/"+user.user.uid).set({
username:username
})

})

}

function login(){

let email=document.getElementById("email").value
let pass=document.getElementById("password").value

firebase.auth().signInWithEmailAndPassword(email,pass)

}

function logout(){
firebase.auth().signOut()
}

firebase.auth().onAuthStateChanged(user=>{

if(user){

document.getElementById("loginPage").style.display="none"
document.getElementById("chatPage").style.display="block"

loadMessages()

}else{

document.getElementById("loginPage").style.display="block"
document.getElementById("chatPage").style.display="none"

}

})
