import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// KENDİ FİREBASE BİLGİLERİNİ BURAYA YAPIŞTIR
const firebaseConfig = {
    apiKey: "BURAYA_KENDİ_API_KEYİN",
    authDomain: "ate837.firebaseapp.com",
    projectId: "ate837",
    storageBucket: "ate837.appspot.com",
    messagingSenderId: "BURAYA_ID",
    appId: "BURAYA_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// BUTON TIKLAMA KONTROLÜ
const loginBtn = document.getElementById('google-login-btn');

if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        console.log("Butona basıldı, pencere açılıyor...");
        signInWithPopup(auth, provider)
            .then((result) => {
                console.log("Giriş yapıldı!");
            })
            .catch((error) => {
                alert("Hata oluştu: " + error.message);
                console.error(error);
            });
    });
} else {
    console.error("HATA: Buton bulunamadı! HTML dosyasındaki ID'yi kontrol et.");
}

// OTURUM DURUMU
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('main-layout').style.display = 'block';
    }
});
