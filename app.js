// app.js - TÜM UYGULAMA TEK DOSYADA

class NovaChat {
    constructor() {
        this.auth = auth;
        this.db = db;
        this.currentUser = null;
        this.currentServer = null;
        this.currentChannel = 'genel';
        this.currentDM = null;
        this.unsubscribes = [];
        
        this.init();
    }

    init() {
        console.log("NovaChat başlatılıyor...");
        
        // Auth durumunu dinle
        this.auth.onAuthStateChanged((user) => {
            if (user) {
                console.log("Kullanıcı giriş yaptı:", user.email);
                this.currentUser = user;
                this.updateUserUI(user);
                this.loadInitialData();
                this.bindEvents();
                
                // Test için otomatik sunucu oluştur
                this.createTestServer();
            } else {
                console.log("Kullanıcı yok, anonim giriş yapılıyor...");
                this.auth.signInAnonymously();
            }
        });
    }

    // Test için örnek sunucu
    async createTestServer() {
        const serverRef = this.db.collection('servers').doc('test-server');
        const serverDoc = await serverRef.get();
        
        if (!serverDoc.exists) {
            await serverRef.set({
                name: 'NovaChat',
                ownerId: 'system',
                createdAt: timestamp(),
                channels: ['genel', 'sohbet', 'oyun']
            });
            console.log("Test sunucusu oluşturuldu.");
        }
        
        this.currentServer = 'test-server';
        this.loadChannels('test-server');
        this.loadMembers('test-server');
        this.listenMessages('test-server', 'genel');
    }

    updateUserUI(user) {
        document.getElementById('currentUserName').textContent = 
            user.displayName || user.email || 'Kullanıcı';
        document.getElementById('currentUserAvatar').src = 
            user.photoURL || 'https://via.placeholder.com/100';
    }

    async loadInitialData() {
        this.loadServers();
        this.loadDMList();
    }

    bindEvents() {
        // Sunucu oluştur
        document.getElementById('addServerBtn').addEventListener('click', () => {
            document.getElementById('createServerModal').classList.add('show');
        });

        document.getElementById('confirmCreateServer').addEventListener('click', () => {
            this.createServer();
        });

        // Kanal oluştur
        document.getElementById('addChannelBtn').addEventListener('click', () => {
            document.getElementById('createChannelModal').classList.add('show');
        });

        document.getElementById('confirmCreateChannel').addEventListener('click', () => {
            this.createChannel();
        });

        // Yeni DM
        document.getElementById('newDmBtn').addEventListener('click', () => {
            document.getElementById('newDmModal').classList.add('show');
            document.getElementById('dmUserSearch').focus();
        });

        document.getElementById('dmUserSearch').addEventListener('input', (e) => {
            this.searchUsers(e.target.value);
        });

        // Mesaj gönder
        document.getElementById('sendMessageBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Profil
        document.getElementById('openProfileBtn').addEventListener('click', () => {
            this.openProfileModal();
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('modalProfileStatus').addEventListener('change', (e) => {
            this.updateStatus(e.target.value);
        });

        // Edit butonları
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const field = e.target.closest('button').dataset.field;
                this.editField(field);
            });
        });

        // Modal kapatma
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
            });
        });

        document.getElementById('cancelCreateServer').addEventListener('click', () => {
            document.getElementById('createServerModal').classList.remove('show');
        });

        document.getElementById('cancelCreateChannel').addEventListener('click', () => {
            document.getElementById('createChannelModal').classList.remove('show');
        });

        document.getElementById('cancelNewDm').addEventListener('click', () => {
            document.getElementById('newDmModal').classList.remove('show');
        });

        // Ana sayfa
        document.getElementById('homeBtn').addEventListener('click', () => {
            this.currentServer = null;
            this.currentDM = null;
            this.currentChannel = null;
            document.getElementById('currentServerName').textContent = 'Ana Sayfa';
            document.getElementById('channelList').innerHTML = '';
            document.getElementById('messagesContainer').innerHTML = '<div style="text-align: center; margin-top: 50px; color: #72767d;">Bir sunucu veya DM seçin</div>';
        });
    }

    // SUNUCU İŞLEMLERİ
    async loadServers() {
        const serversRef = this.db.collection('servers');
        const snapshot = await serversRef.get();
        const serverList = document.getElementById('serverList');
        serverList.innerHTML = '';
        
        snapshot.forEach(doc => {
            const server = doc.data();
            const div = document.createElement('div');
            div.className = 'server-icon';
            div.textContent = server.name.charAt(0).toUpperCase();
            div.title = server.name;
            div.dataset.id = doc.id;
            
            div.addEventListener('click', () => {
                this.currentServer = doc.id;
                this.currentDM = null;
                document.getElementById('currentServerName').textContent = server.name;
                this.loadChannels(doc.id);
                this.loadMembers(doc.id);
                if (server.channels && server.channels.length > 0) {
                    this.listenMessages(doc.id, server.channels[0]);
                }
            });
            
            serverList.appendChild(div);
        });
    }

    async createServer() {
        const name = document.getElementById('serverNameInput').value;
        if (!name) return alert('Sunucu adı gerekli');
        
        await this.db.collection('servers').add({
            name: name,
            ownerId: this.currentUser.uid,
            createdAt: timestamp(),
            channels: ['genel']
        });
        
        document.getElementById('createServerModal').classList.remove('show');
        document.getElementById('serverNameInput').value = '';
        this.loadServers();
    }

    // KANAL İŞLEMLERİ
    async loadChannels(serverId) {
        const serverDoc = await this.db.collection('servers').doc(serverId).get();
        const server = serverDoc.data();
        const channelList = document.getElementById('channelList');
        channelList.innerHTML = '';
        
        if (server.channels) {
            server.channels.forEach(channel => {
                const div = document.createElement('div');
                div.className = `channel-item ${channel === this.currentChannel ? 'active' : ''}`;
                div.innerHTML = `<i class="fas fa-hashtag"></i> ${channel}`;
                
                div.addEventListener('click', () => {
                    document.querySelectorAll('.channel-item').forEach(c => c.classList.remove('active'));
                    div.classList.add('active');
                    this.currentChannel = channel;
                    this.currentDM = null;
                    this.listenMessages(serverId, channel);
                });
                
                channelList.appendChild(div);
            });
        }
    }

    async createChannel() {
        if (!this.currentServer) return alert('Önce bir sunucu seçin');
        
        const name = document.getElementById('channelNameInput').value;
        if (!name) return alert('Kanal adı gerekli');
        
        const serverRef = this.db.collection('servers').doc(this.currentServer);
        await serverRef.update({
            channels: firebase.firestore.FieldValue.arrayUnion(name)
        });
        
        document.getElementById('createChannelModal').classList.remove('show');
        document.getElementById('channelNameInput').value = '';
        this.loadChannels(this.currentServer);
    }

    // MESAJ İŞLEMLERİ
    listenMessages(serverId, channel) {
        // Önceki dinleyicileri temizle
        this.unsubscribes.forEach(unsub => unsub());
        this.unsubscribes = [];
        
        const messagesRef = this.db.collection('messages')
            .where('serverId', '==', serverId)
            .where('channel', '==', channel)
            .orderBy('timestamp', 'asc');
        
        const unsub = messagesRef.onSnapshot((snapshot) => {
            const container = document.getElementById('messagesContainer');
            container.innerHTML = '';
            
            snapshot.forEach(doc => {
                const msg = doc.data();
                this.displayMessage(msg);
            });
            
            // Otomatik scroll
            container.scrollTop = container.scrollHeight;
        });
        
        this.unsubscribes.push(unsub);
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        if (!text) return;
        
        if (this.currentDM) {
            // DM mesajı gönder
            await this.db.collection('dmMessages').add({
                dmId: this.currentDM,
                senderId: this.currentUser.uid,
                senderName: this.currentUser.displayName || 'Kullanıcı',
                senderAvatar: this.currentUser.photoURL || 'https://via.placeholder.com/100',
                content: text,
                timestamp: timestamp()
            });
            
            // Son mesajı güncelle
            await this.db.collection('dms').doc(this.currentDM).update({
                lastMessage: text,
                lastMessageTime: timestamp()
            });
        } else if (this.currentServer && this.currentChannel) {
            // Kanal mesajı gönder
            await this.db.collection('messages').add({
                serverId: this.currentServer,
                channel: this.currentChannel,
                senderId: this.currentUser.uid,
                senderName: this.currentUser.displayName || 'Kullanıcı',
                senderAvatar: this.currentUser.photoURL || 'https://via.placeholder.com/100',
                content: text,
                timestamp: timestamp()
            });
        } else {
            alert('Mesaj göndermek için bir kanal veya DM seçin');
            return;
        }
        
        input.value = '';
    }

    displayMessage(msg) {
        const container = document.getElementById('messagesContainer');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        const time = msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Şimdi';
        
        messageDiv.innerHTML = `
            <img src="${msg.senderAvatar}" class="message-avatar" onerror="this.src='https://via.placeholder.com/100'">
            <div class="message-content">
                <div class="message-header">
                    <span class="message-author">${msg.senderName}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">${msg.content}</div>
            </div>
        `;
        
        container.appendChild(messageDiv);
    }

    // ÜYE İŞLEMLERİ
    async loadMembers(serverId) {
        // Bu örnekte tüm kullanıcıları gösteriyoruz
        const usersRef = this.db.collection('users');
        const snapshot = await usersRef.get();
        const membersList = document.getElementById('membersList');
        membersList.innerHTML = '';
        
        snapshot.forEach(doc => {
            const user = doc.data();
            if (user.uid === this.currentUser.uid) return; // Kendini gösterme (zaten altta var)
            
            const div = document.createElement('div');
            div.className = 'member-item';
            div.innerHTML = `
                <img src="${user.photoURL || 'https://via.placeholder.com/100'}" class="member-avatar" onerror="this.src='https://via.placeholder.com/100'">
                <span class="member-name">${user.displayName || user.email || 'Kullanıcı'}</span>
            `;
            
            div.addEventListener('click', () => {
                this.startDMWithUser(user.uid);
            });
            
            membersList.appendChild(div);
        });
        
        document.getElementById('onlineCount').textContent = snapshot.size;
    }

    // DM İŞLEMLERİ
    async loadDMList() {
        const dmsRef = this.db.collection('dms')
            .where('participants', 'array-contains', this.currentUser.uid)
            .orderBy('lastMessageTime', 'desc');
        
        dmsRef.onSnapshot((snapshot) => {
            const dmList = document.getElementById('dmList');
            dmList.innerHTML = '';
            
            snapshot.forEach(async (doc) => {
                const dm = doc.data();
                const otherUserId = dm.participants.find(id => id !== this.currentUser.uid);
                const userDoc = await this.db.collection('users').doc(otherUserId).get();
                const user = userDoc.data();
                
                const div = document.createElement('div');
                div.className = `dm-item ${dm.id === this.currentDM ? 'active' : ''}`;
                div.dataset.id = doc.id;
                div.innerHTML = `
                    <img src="${user.photoURL || 'https://via.placeholder.com/100'}" class="dm-avatar" onerror="this.src='https://via.placeholder.com/100'">
                    <div class="dm-info">
                        <div class="dm-name">${user.displayName || user.email || 'Kullanıcı'}</div>
                        <div class="dm-last-message">${dm.lastMessage || '...'}</div>
                    </div>
                `;
                
                div.addEventListener('click', () => {
                    this.openDM(doc.id, otherUserId);
                });
                
                dmList.appendChild(div);
            });
        });
    }

    async searchUsers(query) {
        if (!query) return;
        
        const usersRef = this.db.collection('users');
        const snapshot = await usersRef.get();
        const results = document.getElementById('dmSearchResults');
        results.innerHTML = '';
        
        snapshot.forEach(doc => {
            const user = doc.data();
            if (user.uid === this.currentUser.uid) return;
            
            if (user.email?.toLowerCase().includes(query.toLowerCase()) || 
                user.displayName?.toLowerCase().includes(query.toLowerCase())) {
                
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.innerHTML = `
                    <img src="${user.photoURL || 'https://via.placeholder.com/100'}" onerror="this.src='https://via.placeholder.com/100'">
                    <span>${user.displayName || user.email}</span>
                `;
                
                div.addEventListener('click', () => {
                    this.startDMWithUser(user.uid);
                    document.getElementById('newDmModal').classList.remove('show');
                });
                
                results.appendChild(div);
            }
        });
    }

    async startDMWithUser(userId) {
        // Mevcut DM var mı kontrol et
        const dmsRef = this.db.collection('dms');
        const snapshot = await dmsRef
            .where('participants', 'array-contains', this.currentUser.uid)
            .get();
        
        let existingDm = null;
        snapshot.forEach(doc => {
            const dm = doc.data();
            if (dm.participants.includes(userId)) {
                existingDm = doc.id;
            }
        });
        
        if (existingDm) {
            this.openDM(existingDm, userId);
        } else {
            // Yeni DM oluştur
            const newDm = await dmsRef.add({
                participants: [this.currentUser.uid, userId],
                lastMessage: '',
                lastMessageTime: timestamp(),
                createdAt: timestamp()
            });
            this.openDM(newDm.id, userId);
        }
    }

    async openDM(dmId, otherUserId) {
        this.currentDM = dmId;
        this.currentServer = null;
        
        // Önceki dinleyicileri temizle
        this.unsubscribes.forEach(unsub => unsub());
        this.unsubscribes = [];
        
        // UI'ı güncelle
        document.getElementById('currentServerName').textContent = 'Direkt Mesaj';
        document.querySelectorAll('.dm-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`.dm-item[data-id="${dmId}"]`)?.classList.add('active');
        
        // Kullanıcı bilgilerini al
        const userDoc = await this.db.collection('users').doc(otherUserId).get();
        const user = userDoc.data();
        document.getElementById('currentChannelName').textContent = `@${user.displayName || user.email}`;
        
        // DM mesajlarını dinle
        const messagesRef = this.db.collection('dmMessages')
            .where('dmId', '==', dmId)
            .orderBy('timestamp', 'asc');
        
        const unsub = messagesRef.onSnapshot((snapshot) => {
            const container = document.getElementById('messagesContainer');
            container.innerHTML = '';
            
            snapshot.forEach(doc => {
                const msg = doc.data();
                this.displayMessage(msg);
            });
            
            container.scrollTop = container.scrollHeight;
        });
        
        this.unsubscribes.push(unsub);
    }

    // PROFİL İŞLEMLERİ
    async openProfileModal() {
        const modal = document.getElementById('profileModal');
        modal.classList.add('show');
        
        // Kullanıcı bilgilerini yükle
        const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
        const user = userDoc.data();
        
        document.getElementById('modalProfileName').textContent = user.displayName || 'Kullanıcı';
        document.getElementById('modalProfileEmail').textContent = user.email || 'E-posta yok';
        document.getElementById('modalProfileBio').textContent = user.bio || 'Kendinizden bahsedin...';
        document.getElementById('modalProfileAvatar').src = user.photoURL || 'https://via.placeholder.com/100';
        document.getElementById('modalProfileStatus').value = user.status || 'online';
        document.getElementById('modalFriendCount').textContent = user.friendCount || 0;
        document.getElementById('modalServerCount').textContent = user.serverCount || 0;
    }

    async editField(field) {
        let newValue;
        if (field === 'displayName') {
            newValue = prompt('Yeni kullanıcı adı:', document.getElementById('modalProfileName').textContent);
        } else if (field === 'bio') {
            newValue = prompt('Yeni biyografi:', document.getElementById('modalProfileBio').textContent);
        }
        
        if (newValue) {
            await this.db.collection('users').doc(this.currentUser.uid).update({
                [field]: newValue
            });
            
            document.getElementById(`modalProfile${field === 'displayName' ? 'Name' : 'Bio'}`).textContent = newValue;
            if (field === 'displayName') {
                document.getElementById('currentUserName').textContent = newValue;
            }
        }
    }

    async updateStatus(status) {
        await this.db.collection('users').doc(this.currentUser.uid).update({
            status: status
        });
        
        const statusEl = document.getElementById('currentUserStatus');
        statusEl.className = `user-status ${status}`;
        
        const statusText = {
            'online': '🟢 Çevrimiçi',
            'idle': '🌙 Boşta',
            'dnd': '⛔ Rahatsız Etme',
            'invisible': '⚫ Görünmez'
        };
        statusEl.textContent = statusText[status];
    }

    async logout() {
        await this.auth.signOut();
        window.location.reload();
    }
}

// Uygulamayı başlat
window.appManager = new NovaChat();
