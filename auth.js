function register(){

let email = document.getElementById("email").value
let password = document.getElementById("password").value

auth.createUserWithEmailAndPassword(email,password)

.then(()=>{

alert("Kayıt başarılı")

})

.catch((error)=>{

alert(error.message)

})

}



function login(){

let email = document.getElementById("email").value
let password = document.getElementById("password").value

auth.signInWithEmailAndPassword(email,password)

.then(()=>{

document.getElementById("login").style.display="none"
document.getElementById("app").style.display="block"

})

.catch((error)=>{

alert(error.message)

})

}



function logout(){

auth.signOut()
location.reload()

}
