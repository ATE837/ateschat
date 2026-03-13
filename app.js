// ========== GLOBAL DEĞİŞKENLER ==========
let currentUser = null;
let currentServer = null;
let currentChannel = 'genel';
let currentDM = null;
let currentProfileUser = null;
let unsubscribes = [];

// ========== GİRİŞ SİSTEMİ ==========
auth.onAuthStateChanged(async (user) => {
    if (user) {
        console.log("Giriş yapıldı:", user.email);
        currentUser = user;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        
        await loadUserData();
        loadServers();
        loadDMList();
    } else {
        console.log("Giriş yapılmamış");
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
    }
});

// Tab geçişleri
document.getElementById('loginTab').addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
    document.getElementById('loginTab').classList.add('active');
    document.getElementById('loginForm').classList.add('active');
});

document.getElementById('registerTab').addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
    document.getElementById('registerTab').classList.add('active');
    document.getElementById('registerForm').classList.add('active');
});

document.getElementById('adminTab').addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
    document.getElementById('adminTab').classList.add('active');
    document.getElementById('adminForm').classList.add('active');
});

// Giriş
document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (error) {
        document.getElementById('loginError').innerText = error.message;
    }
});

// Kayıt (3 şey ister: kullanıcı adı, email, şifre)
document.getElementById('registerBtn').addEventListener('click', async () => {
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const pass = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;
    
    if (!name || !email || !pass) {
        document.getElementById('registerError').innerText = 'Tüm alanları doldurun';
        return;
    }
    if (pass !== confirm) {
        document.getElementById('registerError').innerText = 'Şifreler eşleşmiyor';
        return;
    }
    
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await cred.user.updateProfile({ displayName: name });
        
        await db.collection('users').doc(cred.user.uid).set({
            uid: cred.user.uid,
            displayName: name,
            email: email,
            photoURL: 'https://via.placeholder.com/100',
            bio: 'Merhaba! NovaChat\'teyim.',
            status: 'online',
            friends: [],
            servers: [],
            createdAt: timestamp()
        });
    } catch (error) {
        document.getElementById('registerError').innerText = error.message;
    }
});

// Admin giriş
document.getElementById('adminLoginBtn').addEventListener('click', async () => {
    const pass = document.getElementById('adminPassword').value;
    if (pass === 'NovaChat2024!') {
        try {
            await auth.signInWithEmailAndPassword('admin@novachat.com', 'NovaChat2024!');
        } catch {
            await auth.createUserWithEmailAndPassword('admin@novachat.com', 'NovaChat2024!');
        }
        showAdminPanel();
    } else {
        document.getElementById('adminError').innerText = 'Hatalı şifre';
    }
});

// ========== KULLANICI VERİLERİ ==========
async function loadUserData() {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) {
        const user = doc.data();
        document.getElementById('currentUserName').innerText = user.displayName;
        document.getElementById('currentUserAvatar').src = user.photoURL;
    }
}

// ========== SUNUCULAR ==========
async function loadServers() {
    const snapshot = await db.collection('servers').get();
    const serverList = document.getElementById('serverList');
    serverList.innerHTML = '';
    
    snapshot.forEach(doc => {
        const server = doc.data();
        const div = document.createElement('div');
        div.className = 'server-icon';
        div.innerText = server.name.charAt(0).toUpperCase();
        div.title = server.name;
        div.onclick = () => selectServer(doc.id, server);
        serverList.appendChild(div);
    });
}

async function selectServer(serverId, server) {
    currentServer = serverId;
    currentDM = null;
    document.getElementById('currentServerName').innerText = server.name;
    loadChannels(serverId);
    loadMembers(serverId);
    if (server.channels?.length) {
        listenMessages(serverId, server.channels[0]);
    }
}

async function loadChannels(serverId) {
    const doc = await db.collection('servers').doc(serverId).get();
    const server = doc.data();
    const channelList = document.getElementById('channelList');
    channelList.innerHTML = '';
    
    server.channels?.forEach(channel => {
        const div = document.createElement('div');
        div.className = `channel-item`;
        div.innerHTML = `<i class="fas fa-hashtag"></i> ${channel}`;
        div.onclick = () => {
            document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
            div.classList.add('active');
            currentChannel = channel;
            listenMessages(serverId, channel);
            document.getElementById('currentChannelName').innerText = `# ${channel}`;
        };
        channelList.appendChild(div);
    });
}

// ========== MESAJLAŞMA ==========
function listenMessages(serverId, channel) {
    unsubscribes.forEach(u => u());
    unsubscribes = [];
    
    const q = db.collection('messages')
        .where('serverId', '==', serverId)
        .where('channel', '==', channel)
        .orderBy('timestamp');
    
    const unsub = q.onSnapshot(snapshot => {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            displayMessage(msg);
        });
        container.scrollTop = container.scrollHeight;
    });
    unsubscribes.push(unsub);
}

function displayMessage(msg) {
    const container = document.getElementById('messagesContainer');
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `
        <img src="${msg.senderAvatar}" class="message-avatar">
        <div class="message-content">
            <div class="message-header">
                <span class="message-author">${msg.senderName}</span>
                <span class="message-time">${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="message-text">${msg.content}</div>
        </div>
    `;
    container.appendChild(div);
}

// Mesaj gönder
document.getElementById('sendMessageBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !currentUser) return;
    
    if (currentServer) {
        await db.collection('messages').add({
            serverId: currentServer,
            channel: currentChannel,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            senderAvatar: currentUser.photoURL,
            content: text,
            timestamp: timestamp()
        });
    } else if (currentDM) {
        await db.collection('dmMessages').add({
            dmId: currentDM,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            senderAvatar: currentUser.photoURL,
            content: text,
            timestamp: timestamp()
        });
    }
    input.value = '';
}

// ========== DM ==========
async function loadDMList() {
    const q = db.collection('dms')
        .where('participants', 'array-contains', currentUser?.uid)
        .orderBy('lastMessageTime', 'desc');
    
    q.onSnapshot(async snapshot => {
        const dmList = document.getElementById('dmList');
        dmList.innerHTML = '';
        
        for (const doc of snapshot.docs) {
            const dm = doc.data();
            const otherId = dm.participants.find(id => id !== currentUser.uid);
            const userDoc = await db.collection('users').doc(otherId).get();
            const user = userDoc.data();
            
            const div = document.createElement('div');
            div.className = 'dm-item';
            div.innerHTML = `
                <img src="${user.photoURL}" class="dm-avatar">
                <div class="dm-info">
                    <div class="dm-name">${user.displayName}</div>
                    <div class="dm-last-message">${dm.lastMessage || '...'}</div>
                </div>
            `;
            div.onclick = () => openDM(doc.id, otherId);
            dmList.appendChild(div);
        }
    });
}

async function openDM(dmId, otherId) {
    currentDM = dmId;
    currentServer = null;
    
    unsubscribes.forEach(u => u());
    unsubscribes = [];
    
    document.getElementById('currentServerName').innerText = 'DM';
    const userDoc = await db.collection('users').doc(otherId).get();
    document.getElementById('currentChannelName').innerText = `@${userDoc.data().displayName}`;
    
    const q = db.collection('dmMessages').where('dmId', '==', dmId).orderBy('timestamp');
    const unsub = q.onSnapshot(snapshot => {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';
        snapshot.forEach(doc => displayMessage(doc.data()));
        container.scrollTop = container.scrollHeight;
    });
    unsubscribes.push(unsub);
}

// Yeni DM
document.getElementById('newDmBtn').addEventListener('click', () => {
    document.getElementById('newDmModal').classList.add('show');
});

document.getElementById('dmUserSearch').addEventListener('input', async (e) => {
    const search = e.target.value.toLowerCase();
    if (!search) return;
    
    const snapshot = await db.collection('users').get();
    const results = document.getElementById('dmSearchResults');
    results.innerHTML = '';
    
    snapshot.forEach(doc => {
        const user = doc.data();
        if (user.uid === currentUser.uid) return;
        if (user.displayName?.toLowerCase().includes(search) || user.email?.toLowerCase().includes(search)) {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = `
                <img src="${user.photoURL}">
                <div>${user.displayName}</div>
                <button class="btn-small" onclick="startDM('${user.uid}')">Mesaj Gönder</button>
            `;
            results.appendChild(div);
        }
    });
});

window.startDM = async function(userId) {
    const snapshot = await db.collection('dms')
        .where('participants', 'array-contains', currentUser.uid)
        .get();
    
    let existing = null;
    snapshot.forEach(doc => {
        if (doc.data().participants.includes(userId)) existing = doc.id;
    });
    
    if (existing) {
        openDM(existing, userId);
    } else {
        const newDm = await db.collection('dms').add({
            participants: [currentUser.uid, userId],
            lastMessage: '',
            lastMessageTime: timestamp(),
            createdAt: timestamp()
        });
        openDM(newDm.id, userId);
    }
    document.getElementById('newDmModal').classList.remove('show');
};

// ========== PROFİL ==========
document.getElementById('openProfileBtn').addEventListener('click', () => openProfileModal());

async function openProfileModal(userId = null) {
    const id = userId || currentUser.uid;
    currentProfileUser = id;
    
    document.getElementById('profileModal').classList.add('show');
    
    const doc = await db.collection('users').doc(id).get();
    const user = doc.data();
    
    document.getElementById('modalProfileAvatar').src = user.photoURL;
    document.getElementById('modalProfileName').innerText = user.displayName;
    document.getElementById('modalProfileEmail').innerText = user.email;
    document.getElementById('modalProfileBio').innerText = user.bio;
    document.getElementById('modalProfileStatus').value = user.status;
    document.getElementById('modalFriendCount').innerText = user.friends?.length || 0;
    
    const isOwn = id === currentUser.uid;
    document.getElementById('editNameBtn').style.display = isOwn ? 'block' : 'none';
    document.getElementById('editBioBtn').style.display = isOwn ? 'block' : 'none';
    document.getElementById('changeAvatarBtn').style.display = isOwn ? 'block' : 'none';
    document.getElementById('logoutBtn').style.display = isOwn ? 'block' : 'none';
    document.getElementById('startCallBtn').style.display = isOwn ? 'none' : 'block';
    document.getElementById('startVideoCallBtn').style.display = isOwn ? 'none' : 'block';
    
    if (!isOwn) {
        const myDoc = await db.collection('users').doc(currentUser.uid).get();
        const myData = myDoc.data();
        const isFriend = myData.friends?.includes(id);
        document.getElementById('friendActionBtn').innerText = isFriend ? 'Arkadaşlıktan Çıkar' : 'Arkadaş Ekle';
        document.getElementById('friendActionBtn').onclick = () => isFriend ? removeFriend(id) : addFriend(id);
    }
}

document.getElementById('editNameBtn').addEventListener('click', async () => {
    const name = prompt('Yeni kullanıcı adı:');
    if (name) {
        await currentUser.updateProfile({ displayName: name });
        await db.collection('users').doc(currentUser.uid).update({ displayName: name });
        document.getElementById('modalProfileName').innerText = name;
        document.getElementById('currentUserName').innerText = name;
    }
});

document.getElementById('editBioBtn').addEventListener('click', async () => {
    const bio = prompt('Yeni biyografi:');
    if (bio) {
        await db.collection('users').doc(currentUser.uid).update({ bio });
        document.getElementById('modalProfileBio').innerText = bio;
    }
});

document.getElementById('modalProfileStatus').addEventListener('change', async (e) => {
    await db.collection('users').doc(currentUser.uid).update({ status: e.target.value });
});

// ========== ARKADAŞLIK ==========
async function addFriend(userId) {
    await db.collection('users').doc(currentUser.uid).update({
        friends: firebase.firestore.FieldValue.arrayUnion(userId)
    });
    openProfileModal(userId);
}

async function removeFriend(userId) {
    await db.collection('users').doc(currentUser.uid).update({
        friends: firebase.firestore.FieldValue.arrayRemove(userId)
    });
    openProfileModal(userId);
}

// ========== ARAMA ==========
document.getElementById('voiceCallBtn').addEventListener('click', startCall);
document.getElementById('videoCallBtn').addEventListener('click', () => startCall(true));

async function startCall(video = false) {
    if (!currentDM) {
        alert('Önce bir DM seçin');
        return;
    }
    
    document.getElementById('callModal').classList.add('show');
    document.getElementById('videoContainer').style.display = video ? 'flex' : 'none';
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: video });
        document.getElementById('localVideo').srcObject = stream;
    } catch (error) {
        alert('Kamera/mikrofon erişimi yok');
    }
}

// ========== KEŞFET ==========
document.getElementById('discoverBtn').addEventListener('click', async () => {
    document.getElementById('discoverModal').classList.add('show');
    
    const snapshot = await db.collection('servers').get();
    const results = document.getElementById('discoverResults');
    results.innerHTML = '';
    
    snapshot.forEach(doc => {
        const server = doc.data();
        results.innerHTML += `
            <div class="discover-item">
                <div class="discover-icon">${server.name.charAt(0)}</div>
                <div class="discover-info">
                    <h4>${server.name}</h4>
                    <p>${server.members?.length || 0} üye</p>
                </div>
                <button class="btn-small" onclick="joinServer('${doc.id}')">Katıl</button>
            </div>
        `;
    });
});

window.joinServer = async function(serverId) {
    await db.collection('servers').doc(serverId).update({
        members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
    document.getElementById('discoverModal').classList.remove('show');
    loadServers();
};

// ========== SUNUCU OLUŞTUR ==========
document.getElementById('addServerBtn').addEventListener('click', async () => {
    const name = prompt('Sunucu adı:');
    if (name) {
        await db.collection('servers').add({
            name: name,
            ownerId: currentUser.uid,
            channels: ['genel'],
            voiceChannels: ['Sohbet'],
            members: [currentUser.uid],
            createdAt: timestamp()
        });
        loadServers();
    }
});

document.getElementById('addChannelBtn').addEventListener('click', async () => {
    if (!currentServer) return alert('Önce sunucu seçin');
    const name = prompt('Kanal adı:');
    if (name) {
        await db.collection('servers').doc(currentServer).update({
            channels: firebase.firestore.FieldValue.arrayUnion(name)
        });
        loadChannels(currentServer);
    }
});

// ========== ÜYE LİSTESİ ==========
async function loadMembers(serverId) {
    const doc = await db.collection('servers').doc(serverId).get();
    const server = doc.data();
    const list = document.getElementById('membersList');
    list.innerHTML = '';
    
    if (server.members) {
        for (const id of server.members) {
            const userDoc = await db.collection('users').doc(id).get();
            const user = userDoc.data();
            list.innerHTML += `
                <div class="member-item" onclick="openProfileModal('${id}')">
                    <img src="${user.photoURL}" class="member-avatar">
                    <span class="member-name">${user.displayName}</span>
                </div>
            `;
        }
    }
    document.getElementById('onlineCount').innerText = server.members?.length || 0;
}

// ========== ADMIN ==========
async function showAdminPanel() {
    document.getElementById('adminPanelModal').classList.add('show');
    
    const users = await db.collection('users').get();
    document.getElementById('adminTotalUsers').innerText = users.size;
    
    const servers = await db.collection('servers').get();
    document.getElementById('adminTotalServers').innerText = servers.size;
    
    const messages = await db.collection('messages').get();
    document.getElementById('adminTotalMessages').innerText = messages.size;
    
    const list = document.getElementById('adminUsersList');
    list.innerHTML = '<h3>Kullanıcılar</h3>';
    users.forEach(doc => {
        const user = doc.data();
        list.innerHTML += `
            <div class="admin-user-item">
                <img src="${user.photoURL}" width="32" height="32" style="border-radius:50%">
                <span>${user.displayName}</span>
                <span>${user.email}</span>
                <button class="btn-danger btn-small" onclick="banUser('${doc.id}')">Banla</button>
            </div>
        `;
    });
}

window.banUser = async function(userId) {
    if (confirm('Kullanıcıyı banlamak istediğinize emin misiniz?')) {
        await db.collection('bannedUsers').doc(userId).set({ banned: true });
        alert('Kullanıcı banlandı');
    }
};

// ========== ÇIKIŞ ==========
document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());

// ========== MODAL KAPATMA ==========
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
    });
});

// Ana sayfa
document.getElementById('homeBtn').addEventListener('click', () => {
    currentServer = null;
    currentDM = null;
    document.getElementById('currentServerName').innerText = 'Ana Sayfa';
    document.getElementById('currentChannelName').innerText = '# genel';
    document.getElementById('messagesContainer').innerHTML = '<div style="text-align:center;color:#72767d;margin-top:50px;">Bir sohbet seçin</div>';
});
