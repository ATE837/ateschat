// app.js içindeki mesaj gönderme fonksiyonunu bununla değiştir
async function sendMessage(text) {
  const user = auth.currentUser;
  if (user) {
    await addDoc(collection(db, "messages"), {
      text: text,
      name: user.displayName || "Anonim Ateş", // İsim yoksa bunu yazar
      photo: user.photoURL || "https://via.placeholder.com/40", // Resim yoksa bunu koyar
      uid: user.uid,
      createdAt: serverTimestamp()
    });
  }
}
