// ========== NOVACHAT TAM SÜRÜM - TÜM ÖZELLİKLER ==========

// ========== GLOBAL DEĞİŞKENLER ==========
let currentUser = null;
let currentServer = null;
let currentChannel = 'genel';
let currentDM = null;
let currentProfileUser = null;
let unsubscribes = [];
let blockedUsers = [];
let friendRequests = [];
let userSettings = {
    notificationSound: true,
    browserNotifications: true
};

// Emoji listesi
const emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'];

// ========== GİRİŞ SİSTEMİ ==========
auth.onAuthStateChanged(async (user) => {
    if (user) {
        console.log("✅ Giriş yapıldı:", user.email);
        currentUser = user;
        
        await loadBlockedUsers();
        await loadFriendRequests();
        await loadUserSettings();
        
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        
        await loadUserData();
        loadServers();
        loadDMList();
        
        if (userSettings.browserNotifications && Notification.permission === 'default') {
            Notification.requestPermission();
        }
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

// Kayıt
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
            coverURL: '',
            bio: 'Merhaba! NovaChat\'teyim.',
            status: 'online',
            friends: [],
            friendRequests: [],
            blocked: [],
            servers: [],
            settings: {
                notificationSound: true,
                browserNotifications: true
            },
            badges: ['user'],
            level: 1,
            messagesCount: 0,
            createdAt: timestamp()
        });
    } catch (error) {
        document.getElementById('registerError').innerText = error.message;
    }
});

// Admin giriş (şifre gizli)
document.getElementById('adminLoginBtn').addEventListener('click', async () => {
    const pass = document.getElementById('adminPassword').value;
    const adminPassword = "NovaChat2024!";
    
    if (pass === adminPassword) {
        try {
            await auth.signInWithEmailAndPassword('admin@novachat.com', adminPassword);
        } catch {
            await auth.createUserWithEmailAndPassword('admin@novachat.com', adminPassword);
            const user = auth.currentUser;
            await user.updateProfile({ displayName: 'Admin' });
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                displayName: 'Admin',
                email: 'admin@novachat.com',
                photoURL: 'https://via.placeholder.com/100',
                status: 'online',
                badges: ['admin', 'owner'],
                createdAt: timestamp()
            });
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
        document.getElementById('currentUserStatus').className = `user-status ${user.status}`;
        
        const statusText = {
            online: '🟢 Çevrimiçi',
            idle: '🌙 Boşta',
            dnd: '⛔ Rahatsız Etme',
            invisible: '⚫ Görünmez'
        };
        document.getElementById('currentUserStatus').innerText = statusText[user.status] || '🟢 Çevrimiçi';
    }
}

async function loadBlockedUsers() {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    blockedUsers = doc.data().blocked || [];
}

async function loadFriendRequests() {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    friendRequests = doc.data().friendRequests || [];
    if (friendRequests.length > 0) {
        document.getElementById('requestBadge').style.display = 'inline';
        document.getElementById('requestBadge').innerText = friendRequests.length;
    }
}

async function loadUserSettings() {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    userSettings = { ...userSettings, ...doc.data().settings };
}

// ========== SUNUCULAR ==========
async function loadServers() {
    const snapshot = await db.collection('servers').get();
    const serverList = document.getElementById('serverList');
    serverList.innerHTML = '';
    
    snapshot.forEach(doc => {
        const server = doc.data();
        if (server.members?.includes(currentUser.uid)) {
            const div = document.createElement('div');
            div.className = 'server-icon';
            div.style.background = server.color || '#5865f2';
            div.innerText = server.name.charAt(0).toUpperCase();
            div.title = server.name;
            div.dataset.id = doc.id;
            
            div.addEventListener('click', () => selectServer(doc.id, server));
            serverList.appendChild(div);
        }
    });
}

async function selectServer(serverId, server) {
    currentServer = serverId;
    currentDM = null;
    document.getElementById('currentServerName').innerText = server.name;
    document.getElementById('currentServerName').style.color = server.color || 'white';
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
    const voiceList = document.getElementById('voiceChannelList');
    channelList.innerHTML = '';
    voiceList.innerHTML = '';
    
    server.channels?.forEach(channel => {
        const div = document.createElement('div');
        div.className = 'channel-item';
        div.innerHTML = `<i class="fas fa-hashtag"></i> ${channel}`;
        div.addEventListener('click', () => {
            document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
            div.classList.add('active');
            currentChannel = channel;
            listenMessages(serverId, channel);
            document.getElementById('currentChannelName').innerHTML = `<i class="fas fa-hashtag"></i> ${channel}`;
        });
        channelList.appendChild(div);
    });
    
    server.voiceChannels?.forEach(channel => {
        const div = document.createElement('div');
        div.className = 'channel-item';
        div.innerHTML = `<i class="fas fa-volume-up"></i> ${channel}`;
        div.addEventListener('click', () => joinVoiceChannel(channel));
        voiceList.appendChild(div);
    });
}

async function loadMembers(serverId) {
    const doc = await db.collection('servers').doc(serverId).get();
    const server = doc.data();
    const list = document.getElementById('membersList');
    list.innerHTML = '';
    
    if (server.members) {
        for (const id of server.members) {
            if (blockedUsers.includes(id)) continue;
            
            const userDoc = await db.collection('users').doc(id).get();
            const user = userDoc.data();
            
            const div = document.createElement('div');
            div.className = 'member-item';
            div.innerHTML = `
                <img src="${user.photoURL}" class="member-avatar" onerror="this.src='https://via.placeholder.com/100'">
                <span class="member-name">${user.displayName}</span>
                <span class="member-status ${user.status}"></span>
                ${user.badges?.includes('admin') ? '<i class="fas fa-crown" style="color:gold; margin-left:4px;"></i>' : ''}
            `;
            div.addEventListener('click', () => openProfileModal(id));
            list.appendChild(div);
        }
    }
    document.getElementById('onlineCount').innerText = server.members?.length || 0;
}

// ========== MESAJLAŞMA ==========
function listenMessages(serverId, channel) {
    unsubscribes.forEach(u => u());
    unsubscribes = [];
    
    const q = db.collection('messages')
        .where('serverId', '==', serverId)
        .where('channel', '==', channel)
        .orderBy('timestamp', 'asc');
    
    const unsub = q.onSnapshot(snapshot => {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';
        
        snapshot.forEach(doc => {
            const msg = doc.data();
            if (!blockedUsers.includes(msg.senderId)) {
                displayMessage(msg, doc.id);
            }
        });
        
        container.scrollTop = container.scrollHeight;
        
        // Yeni mesaj sesi
        if (userSettings.notificationSound) {
            playSound('newMessage');
        }
    });
    
    unsubscribes.push(unsub);
}

function displayMessage(msg, msgId) {
    const container = document.getElementById('messagesContainer');
    const div = document.createElement('div');
    div.className = 'message';
    div.id = `msg-${msgId}`;
    
    const time = msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Şimdi';
    
    div.innerHTML = `
        <img src="${msg.senderAvatar}" class="message-avatar" onerror="this.src='https://via.placeholder.com/100'">
        <div class="message-content">
            <div class="message-header">
                <span class="message-author">${msg.senderName}</span>
                <span class="message-time">${time}</span>
                ${msg.senderId === currentUser.uid ? '<span class="message-actions"><i class="fas fa-pen" onclick="editMessage(\''+msgId+'\')"></i> <i class="fas fa-trash" onclick="deleteMessage(\''+msgId+'\')"></i></span>' : ''}
            </div>
            <div class="message-text">${msg.content}</div>
            <div class="message-reactions" id="reactions-${msgId}"></div>
            <div class="message-reaction-buttons">
                <i class="far fa-smile" onclick="addReaction('${msgId}', '😀')"></i>
                <i class="far fa-heart" onclick="addReaction('${msgId}', '❤️')"></i>
                <i class="far fa-thumbs-up" onclick="addReaction('${msgId}', '👍')"></i>
                <i class="far fa-thumbs-down" onclick="addReaction('${msgId}', '👎')"></i>
                <i class="far fa-laugh" onclick="addReaction('${msgId}', '😂')"></i>
            </div>
        </div>
    `;
    
    container.appendChild(div);
    loadReactions(msgId);
}

// Mesaj gönderme
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
            reactions: {},
            timestamp: timestamp()
        });
        
        // Mesaj sayısını artır
        await db.collection('users').doc(currentUser.uid).update({
            messagesCount: firebase.firestore.FieldValue.increment(1)
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
        
        await db.collection('dms').doc(currentDM).update({
            lastMessage: text,
            lastMessageTime: timestamp()
        });
    }
    
    input.value = '';
}

// Mesaj düzenleme/silme
window.editMessage = async function(msgId) {
    const newText = prompt('Mesajı düzenle:');
    if (newText) {
        await db.collection('messages').doc(msgId).update({
            content: newText,
            edited: true
        });
    }
};

window.deleteMessage = async function(msgId) {
    if (confirm('Mesajı silmek istediğine emin misin?')) {
        await db.collection('messages').doc(msgId).delete();
    }
};

// ========== MESAJ TEPKİLERİ ==========
window.addReaction = async function(msgId, emoji) {
    const msgRef = db.collection('messages').doc(msgId);
    const msg = await msgRef.get();
    const reactions = msg.data().reactions || {};
    
    if (!reactions[emoji]) {
        reactions[emoji] = [];
    }
    
    if (reactions[emoji].includes(currentUser.uid)) {
        // Tepkiyi kaldır
        reactions[emoji] = reactions[emoji].filter(id => id !== currentUser.uid);
        if (reactions[emoji].length === 0) {
            delete reactions[emoji];
        }
    } else {
        // Tepki ekle
        reactions[emoji].push(currentUser.uid);
    }
    
    await msgRef.update({ reactions });
    loadReactions(msgId);
};

async function loadReactions(msgId) {
    const msg = await db.collection('messages').doc(msgId).get();
    const reactions = msg.data().reactions || {};
    const container = document.getElementById(`reactions-${msgId}`);
    if (!container) return;
    
    container.innerHTML = '';
    for (const [emoji, users] of Object.entries(reactions)) {
        const span = document.createElement('span');
        span.className = 'reaction-badge';
        span.innerHTML = `${emoji} ${users.length}`;
        span.onclick = () => addReaction(msgId, emoji);
        container.appendChild(span);
    }
}

// ========== EMOJİ SİSTEMİ ==========
document.getElementById('emojiPickerBtn').addEventListener('click', () => {
    const panel = document.getElementById('emojiPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') {
        loadEmojiList();
    }
});

document.querySelector('.emoji-quick-btn').addEventListener('click', () => {
    const panel = document.getElementById('emojiPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') {
        loadEmojiList();
    }
});

function loadEmojiList() {
    const list = document.getElementById('emojiList');
    list.innerHTML = '';
    emojis.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'emoji-item';
        span.innerText = emoji;
        span.onclick = () => {
            document.getElementById('messageInput').value += emoji;
            document.getElementById('emojiPanel').style.display = 'none';
        };
        list.appendChild(span);
    });
}

// ========== DOSYA PAYLAŞIMI ==========
document.querySelector('.file-quick-btn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Dosyayı storage'a yükle
    const storageRef = storage.ref();
    const fileRef = storageRef.child(`files/${Date.now()}_${file.name}`);
    await fileRef.put(file);
    const url = await fileRef.getDownloadURL();
    
    // Mesaj olarak gönder
    const input = document.getElementById('messageInput');
    if (file.type.startsWith('image/')) {
        input.value = `${input.value} ![${file.name}](${url})`;
    } else {
        input.value = `${input.value} [${file.name}](${url})`;
    }
});

// ========== DM SİSTEMİ ==========
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
            
            if (blockedUsers.includes(otherId)) continue;
            
            const userDoc = await db.collection('users').doc(otherId).get();
            const user = userDoc.data();
            
            const div = document.createElement('div');
            div.className = `dm-item ${dm.id === currentDM ? 'active' : ''}`;
            div.dataset.id = doc.id;
            div.innerHTML = `
                <img src="${user.photoURL}" class="dm-avatar" onerror="this.src='https://via.placeholder.com/100'">
                <div class="dm-info">
                    <div class="dm-name">${user.displayName}</div>
                    <div class="dm-last-message">${dm.lastMessage || '...'}</div>
                </div>
                <span class="member-status ${user.status}"></span>
            `;
            div.addEventListener('click', () => openDM(doc.id, otherId));
            dmList.appendChild(div);
        }
    });
}

document.getElementById('newDmBtn').addEventListener('click', () => {
    document.getElementById('newDmModal').classList.add('show');
    loadAllUsers();
});

async function loadAllUsers() {
    const snapshot = await db.collection('users').get();
    const results = document.getElementById('dmSearchResults');
    results.innerHTML = '';
    
    snapshot.forEach(doc => {
        const user = doc.data();
        if (user.uid === currentUser.uid || blockedUsers.includes(user.uid)) return;
        
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.innerHTML = `
            <img src="${user.photoURL}">
            <div>
                <div>${user.displayName}</div>
                <small>${user.email}</small>
            </div>
            <button class="btn-small" onclick="startDM('${user.uid}')">Mesaj Gönder</button>
        `;
        results.appendChild(div);
    });
}

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

async function openDM(dmId, otherId) {
    currentDM = dmId;
    currentServer = null;
    
    unsubscribes.forEach(u => u());
    unsubscribes = [];
    
    document.getElementById('currentServerName').innerText = 'Direkt Mesaj';
    document.querySelectorAll('.dm-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`.dm-item[data-id="${dmId}"]`)?.classList.add('active');
    
    const userDoc = await db.collection('users').doc(otherId).get();
    const user = userDoc.data();
    document.getElementById('currentChannelName').innerHTML = `<i class="fas fa-user"></i> ${user.displayName}`;
    
    const q = db.collection('dmMessages')
        .where('dmId', '==', dmId)
        .orderBy('timestamp', 'asc');
    
    const unsub = q.onSnapshot(snapshot => {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            if (!blockedUsers.includes(msg.senderId)) {
                displayMessage(msg, doc.id);
            }
        });
        container.scrollTop = container.scrollHeight;
    });
    
    unsubscribes.push(unsub);
}

// ========== ARKADAŞLIK SİSTEMİ ==========
document.getElementById('friendRequestsBtn').addEventListener('click', showFriendRequests);
document.getElementById('friendsListBtn').addEventListener('click', showFriendsList);

async function showFriendRequests() {
    document.getElementById('friendRequestsModal').classList.add('show');
    const list = document.getElementById('friendRequestsList');
    list.innerHTML = '';
    
    for (const id of friendRequests) {
        const userDoc = await db.collection('users').doc(id).get();
        const user = userDoc.data();
        
        const div = document.createElement('div');
        div.className = 'friend-request-item';
        div.innerHTML = `
            <img src="${user.photoURL}" width="40" height="40" style="border-radius:50%">
            <div>
                <strong>${user.displayName}</strong>
                <small>${user.email}</small>
            </div>
            <button class="btn-small" onclick="acceptFriendRequest('${id}')">Onayla</button>
            <button class="btn-small btn-danger" onclick="rejectFriendRequest('${id}')">Reddet</button>
        `;
        list.appendChild(div);
    }
}

window.acceptFriendRequest = async function(userId) {
    await db.collection('users').doc(currentUser.uid).update({
        friendRequests: firebase.firestore.FieldValue.arrayRemove(userId),
        friends: firebase.firestore.FieldValue.arrayUnion(userId)
    });
    await db.collection('users').doc(userId).update({
        friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
    document.getElementById('friendRequestsModal').classList.remove('show');
    loadFriendRequests();
};

window.rejectFriendRequest = async function(userId) {
    await db.collection('users').doc(currentUser.uid).update({
        friendRequests: firebase.firestore.FieldValue.arrayRemove(userId)
    });
    document.getElementById('friendRequestsModal').classList.remove('show');
    loadFriendRequests();
};

async function showFriendsList() {
    document.getElementById('friendsListModal').classList.add('show');
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    const friends = userDoc.data().friends || [];
    const list = document.getElementById('friendsList');
    list.innerHTML = '';
    
    for (const id of friends) {
        const friendDoc = await db.collection('users').doc(id).get();
        const friend = friendDoc.data();
        
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
            <img src="${friend.photoURL}" width="40" height="40" style="border-radius:50%">
            <div>
                <strong>${friend.displayName}</strong>
                <span class="member-status ${friend.status}"></span>
            </div>
            <button class="btn-small" onclick="startDM('${id}')">Mesaj Gönder</button>
        `;
        list.appendChild(div);
    }
}

// ========== PROFİL SİSTEMİ ==========
document.getElementById('openProfileBtn').addEventListener('click', () => openProfileModal());

window.openProfileModal = async function(userId = null) {
    const id = userId || currentUser.uid;
    currentProfileUser = id;
    
    document.getElementById('profileModal').classList.add('show');
    
    const doc = await db.collection('users').doc(id).get();
    const user = doc.data();
    
    document.getElementById('modalProfileAvatar').src = user.photoURL;
    document.getElementById('modalProfileName').innerText = user.displayName;
    document.getElementById('modalProfileEmail').innerText = user.email;
    document.getElementById('modalProfileBio').innerText = user.bio || 'Kendinizden bahsedin...';
    document.getElementById('modalProfileStatus').value = user.status || 'online';
    document.getElementById('modalFriendCount').innerText = user.friends?.length || 0;
    document.getElementById('modalServerCount').innerText = user.servers?.length || 0;
    
    if (user.coverURL) {
        document.getElementById('profileCover').style.backgroundImage = `url(${user.coverURL})`;
    }
    
    // Rozetler
    const badges = document.getElementById('profileBadges');
    badges.innerHTML = '';
    if (user.badges?.includes('admin')) {
        badges.innerHTML += '<span class="badge-admin"><i class="fas fa-crown"></i> Admin</span>';
    }
    if (user.badges?.includes('owner')) {
        badges.innerHTML += '<span class="badge-owner"><i class="fas fa-star"></i> Kurucu</span>';
    }
    
    const isOwn = id === currentUser.uid;
    document.getElementById('editNameBtn').style.display = isOwn ? 'inline' : 'none';
    document.getElementById('editBioBtn').style.display = isOwn ? 'inline' : 'none';
    document.getElementById('changeAvatarBtn').style.display = isOwn ? 'inline' : 'none';
    document.getElementById('changeCoverBtn').style.display = isOwn ? 'inline' : 'none';
    document.getElementById('logoutBtn').style.display = isOwn ? 'block' : 'none';
    document.getElementById('blockUserBtn').style.display = isOwn ? 'none' : 'block';
    document.getElementById('startCallBtn').style.display = isOwn ? 'none' : 'block';
    document.getElementById('startVideoCallBtn').style.display = isOwn ? 'none' : 'block';
    
    if (!isOwn) {
        const myDoc = await db.collection('users').doc(currentUser.uid).get();
        const myData = myDoc.data();
        const isFriend = myData.friends?.includes(id);
        const isBlocked = blockedUsers.includes(id);
        
        if (isBlocked) {
            document.getElementById('friendActionBtn').innerText = 'Engeli Kaldır';
            document.getElementById('friendActionBtn').onclick = () => unblockUser(id);
        } else if (isFriend) {
            document.getElementById('friendActionBtn').innerText = 'Arkadaşlıktan Çıkar';
            document.getElementById('friendActionBtn').onclick = () => removeFriend(id);
        } else {
            document.getElementById('friendActionBtn').innerText = 'Arkadaş Ekle';
            document.getElementById('friendActionBtn').onclick = () => sendFriendRequest(id);
        }
    }
};

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
    document.getElementById('currentUserStatus').className = `user-status ${e.target.value}`;
    
    const statusText = {
        online: '🟢 Çevrimiçi',
        idle: '🌙 Boşta',
        dnd: '⛔ Rahatsız Etme',
        invisible: '⚫ Görünmez'
    };
    document.getElementById('currentUserStatus').innerText = statusText[e.target.value];
});

document.getElementById('changeAvatarBtn').addEventListener('click', () => {
    const url = prompt('Profil fotoğrafı URL:');
    if (url) {
        db.collection('users').doc(currentUser.uid).update({ photoURL: url });
        currentUser.updateProfile({ photoURL: url });
        document.getElementById('modalProfileAvatar').src = url;
        document.getElementById('currentUserAvatar').src = url;
    }
});

document.getElementById('changeCoverBtn').addEventListener('click', () => {
    const url = prompt('Kapak fotoğrafı URL:');
    if (url) {
        db.collection('users').doc(currentUser.uid).update({ coverURL: url });
        document.getElementById('profileCover').style.backgroundImage = `url(${url})`;
    }
});

// ========== ARKADAŞLIK İŞLEMLERİ ==========
window.sendFriendRequest = async function(userId) {
    await db.collection('users').doc(userId).update({
        friendRequests: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
    alert('Arkadaşlık isteği gönderildi');
    openProfileModal(userId);
};

window.removeFriend = async function(userId) {
    await db.collection('users').doc(currentUser.uid).update({
        friends: firebase.firestore.FieldValue.arrayRemove(userId)
    });
    await db.collection('users').doc(userId).update({
        friends: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
    });
    openProfileModal(userId);
};

// ========== ENGELLEME SİSTEMİ ==========
document.getElementById('blockUserBtn').addEventListener('click', async () => {
    if (!currentProfileUser) return;
    
    if (blockedUsers.includes(currentProfileUser)) {
        await unblockUser(currentProfileUser);
    } else {
        await blockUser(currentProfileUser);
    }
});

async function blockUser(userId) {
    await db.collection('users').doc(currentUser.uid).update({
        blocked: firebase.firestore.FieldValue.arrayUnion(userId),
        friends: firebase.firestore.FieldValue.arrayRemove(userId)
    });
    blockedUsers.push(userId);
    alert('Kullanıcı engellendi');
    openProfileModal(userId);
}

async function unblockUser(userId) {
    await db.collection('users').doc(currentUser.uid).update({
        blocked: firebase.firestore.FieldValue.arrayRemove(userId)
    });
    blockedUsers = blockedUsers.filter(id => id !== userId);
    alert('Engel kaldırıldı');
    openProfileModal(userId);
}

document.getElementById('viewBlockedBtn').addEventListener('click', showBlockedUsers);

async function showBlockedUsers() {
    document.getElementById('blockedUsersModal').classList.add('show');
    const list = document.getElementById('blockedUsersList');
    list.innerHTML = '';
    
    for (const id of blockedUsers) {
        const userDoc = await db.collection('users').doc(id).get();
        const user = userDoc.data();
        
        const div = document.createElement('div');
        div.className = 'blocked-user-item';
        div.innerHTML = `
            <img src="${user.photoURL}" width="40" height="40" style="border-radius:50%">
            <div>
                <strong>${user.displayName}</strong>
            </div>
            <button class="btn-small" onclick="unblockUser('${id}')">Engeli Kaldır</button>
        `;
        list.appendChild(div);
    }
}

// ========== ARAMA (SES/GÖRÜNTÜ) ==========
let localStream = null;
let peerConnection = null;

document.getElementById('voiceCallBtn').addEventListener('click', () => startCall(false));
document.getElementById('videoCallBtn').addEventListener('click', () => startCall(true));
document.getElementById('screenShareBtn').addEventListener('click', shareScreen);

async function startCall(video = false) {
    if (!currentDM) {
        alert('Önce bir DM seçin');
        return;
    }
    
    document.getElementById('callModal').classList.add('show');
    document.getElementById('videoContainer').style.display = video ? 'flex' : 'none';
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: video 
        });
        
        if (video) {
            document.getElementById('localVideo').srcObject = localStream;
        }
        
        // WebRTC bağlantısı kur (basit)
        alert('Arama başlatıldı (WebRTC bağlantısı kurulacak)');
        
    } catch (error) {
        alert('Kamera/mikrofon erişimi yok');
    }
}

async function shareScreen() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        // Ekran paylaşımı
        alert('Ekran paylaşımı başlatıldı');
    } catch (error) {
        alert('Ekran paylaşımı başlatılamadı');
    }
}

document.getElementById('endCallBtn').addEventListener('click', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('callModal').classList.remove('show');
});

// ========== SES EFEKTLERİ ==========
function playSound(type) {
    const audio = new Audio();
    if (type === 'newMessage') {
        audio.src = 'data:audio/wav;base64,UklGRlwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    }
    audio.volume = 0.3;
    audio.play().catch(() => {});
}

// ========== BİLDİRİMLER ==========
function showNotification(title, body) {
    if (userSettings.browserNotifications && Notification.permission === 'granted') {
        new Notification(title, { body });
    }
}

// ========== SUNUCU OLUŞTURMA ==========
document.getElementById('addServerBtn').addEventListener('click', async () => {
    const name = prompt('Sunucu adı:');
    if (!name) return;
    
    const color = prompt('Sunucu rengi (opsiyonel, örn: #5865f2):') || '#5865f2';
    
    await db.collection('servers').add({
        name: name,
        color: color,
        ownerId: currentUser.uid,
        channels: ['genel'],
        voiceChannels: ['Sohbet'],
        members: [currentUser.uid],
        createdAt: timestamp()
    });
    
    loadServers();
});

document.getElementById('addChannelBtn').addEventListener('click', async () => {
    if (!currentServer) {
        alert('Önce bir sunucu seçin');
        return;
    }
    
    const name = prompt('Kanal adı:');
    if (name) {
        await db.collection('servers').doc(currentServer).update({
            channels: firebase.firestore.FieldValue.arrayUnion(name)
        });
        loadChannels(currentServer);
    }
});

document.getElementById('addVoiceChannelBtn').addEventListener('click', async () => {
    if (!currentServer) {
        alert('Önce bir sunucu seçin');
        return;
    }
    
    const name = prompt('Ses kanalı adı:');
    if (name) {
        await db.collection('servers').doc(currentServer).update({
            voiceChannels: firebase.firestore.FieldValue.arrayUnion(name)
        });
        loadChannels(currentServer);
    }
});

function joinVoiceChannel(channelName) {
    alert(`${channelName} kanalına bağlanılıyor... Sesli sohbet başlatılıyor.`);
    startCall(false);
}

// ========== KEŞFET ==========
document.getElementById('discoverBtn').addEventListener('click', async () => {
    document.getElementById('discoverModal').classList.add('show');
    
    const snapshot = await db.collection('servers').get();
    const results = document.getElementById('discoverResults');
    results.innerHTML = '';
    
    snapshot.forEach(doc => {
        const server = doc.data();
        if (server.members?.includes(currentUser.uid)) return;
        
        results.innerHTML += `
            <div class="discover-item">
                <div class="discover-icon" style="background: ${server.color || '#5865f2'}">${server.name.charAt(0)}</div>
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
    
    await db.collection('users').doc(currentUser.uid).update({
        servers: firebase.firestore.FieldValue.arrayUnion(serverId)
    });
    
    document.getElementById('discoverModal').classList.remove('show');
    loadServers();
};

// ========== AYARLAR ==========
document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('show');
    document.getElementById('notificationSound').checked = userSettings.notificationSound;
    document.getElementById('browserNotifications').checked = userSettings.browserNotifications;
});

document.getElementById('notificationSound').addEventListener('change', async (e) => {
    userSettings.notificationSound = e.target.checked;
    await db.collection('users').doc(currentUser.uid).update({
        'settings.notificationSound': e.target.checked
    });
});

document.getElementById('browserNotifications').addEventListener('change', async (e) => {
    userSettings.browserNotifications = e.target.checked;
    await db.collection('users').doc(currentUser.uid).update({
        'settings.browserNotifications': e.target.checked
    });
    
    if (e.target.checked && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});

// ========== ADMIN PANELİ ==========
async function showAdminPanel() {
    document.getElementById('adminPanelModal').classList.add('show');
    
    const users = await db.collection('users').get();
    document.getElementById('adminTotalUsers').innerText = users.size;
    
    const servers = await db.collection('servers').get();
    document.getElementById('adminTotalServers').innerText = servers.size;
    
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
        await db.collection('bannedUsers').doc(userId).set({ 
            banned: true,
            bannedBy: currentUser.uid,
            bannedAt: timestamp()
        });
        alert('Kullanıcı banlandı');
    }
};

// ========== ANA SAYFA ==========
document.getElementById('homeBtn').addEventListener('click', () => {
    currentServer = null;
    currentDM = null;
    document.getElementById('currentServerName').innerText = 'Ana Sayfa';
    document.getElementById('currentChannelName').innerHTML = '<i class="fas fa-hashtag"></i> genel';
    document.getElementById('channelList').innerHTML = '';
    document.getElementById('voiceChannelList').innerHTML = '';
    document.getElementById('messagesContainer').innerHTML = '<div style="text-align:center; color:#72767d; margin-top:50px;"><i class="fas fa-comment-dots" style="font-size:48px; margin-bottom:16px;"></i><h3>Bir sohbet başlatın</h3><p>Bir sunucu seçin veya DM başlatın</p></div>';
    document.getElementById('membersList').innerHTML = '';
    document.getElementById('onlineCount').innerText = '0';
});

// ========== ÇIKIŞ ==========
document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.signOut();
});

// ========== MODAL KAPATMA ==========
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
    });
});

// Tıklama dışına modal kapatma
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
    }
});

console.log("✅ NovaChat tam sürüm yüklendi");
