function register(){

let email=document.getElementById("email").value
let password=document.getElementById("password").value

firebase.auth().createUserWithEmailAndPassword(email,password)

}

function login(){

let email=document.getElementById("email").value
let password=document.getElementById("password").value

firebase.auth().signInWithEmailAndPassword(email,password)

}

function logout(){

firebase.auth().signOut()

}
