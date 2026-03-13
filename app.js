// Giriş kontrolü
auth.onAuthStateChanged(user => {
    if (user) {
        console.log("Giriş yapıldı:", user.email);
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        document.getElementById('app').innerHTML = `<h1>Hoş Geldin ${user.email}</h1><button onclick="logout()">Çıkış</button>`;
    } else {
        console.log("Giriş yapılmamış");
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
    }
});

// Giriş fonksiyonu
window.login = function() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
            document.getElementById('error').innerText = error.message;
        });
}

// Kayıt fonksiyonu
window.register = function() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    auth.createUserWithEmailAndPassword(email, password)
        .catch(error => {
            document.getElementById('error').innerText = error.message;
        });
}

// Admin giriş
window.adminLogin = function() {
    const email = "admin@novachat.com";
    const password = "NovaChat2024!";
    
    auth.signInWithEmailAndPassword(email, password)
        .catch(() => {
            // Admin yoksa oluştur
            auth.createUserWithEmailAndPassword(email, password)
                .catch(error => {
                    document.getElementById('error').innerText = error.message;
                });
        });
}

// Çıkış
window.logout = function() {
    auth.signOut();
}
