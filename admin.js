function banUser(name){

db.ref("banned/"+name).set(true)

alert("Kullanıcı banlandı")

}
