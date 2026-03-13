// app.js - NovaChat Ana Uygulama

class NovaChat {
    constructor() {
        this.auth = auth;
        this.db = db;
        this.currentUser = null;
        this.currentServer = null;
        this.currentChannel = 'genel';
        this.currentDM = null;
        this.currentProfileUser = null;
        this.unsubscribes = [];
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentCall = null;
        this.adminPassword = "NovaChat2024!"; // Admin şifresi
        
        this.init();
    }

    init() {
        console.log("NovaChat başlatılıyor...");
        this.bindAuthEvents();
        this.bindUIEvents();
    }

    // ========== GİRİŞ SİSTEMİ ==========
    bindAuthEvents() {
        // Tab geçişleri
        document.getElementById('loginTab').addEventListener('click', () => this.showLoginTab('login'));
        document.getElementById('registerTab').addEventListener('click', () => this.showLoginTab('register'));
        document.getElementById('adminTab').addEventListener('click', () => this.showLoginTab('admin'));

        // Giriş butonu
        document.getElementById('loginBtn').addEventListener('click', () => this.login());

        // Kayıt butonu
        document.getElementById('registerBtn').addEventListener('click', () => this.register());

        // Admin giriş
        document.getElementById('adminLoginBtn').addEventListener('click', () => this.adminLogin());

        // Enter ile giriş
        document.getElementById('loginPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });

        // Auth durumunu dinle
        this.auth.onAuthStateChanged((user) => {
            if (user) {
                this.currentUser = user;
                this.hideLoginScreen();
                this.loadUserData();
                this.loadServers();
                this.loadDMList();
                this.loadFriends();
                this.checkAdminStatus(user);
            }
        });
    }

    showLoginTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
        
        if (tab === 'login') {
            document.getElementById('loginTab').classList.add('active');
            document.getElementById('loginForm').classList.add('active');
        } else if (tab === 'register') {
            document.getElementById('registerTab').classList.add('active');
            document.getElementById('registerForm').classList.add('active');
        } else if (tab === 'admin') {
            document.getElementById('adminTab').classList.add('active');
            document.getElementById('adminForm').classList.add('active');
        }
    }

    async login() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const errorEl = document.getElementById('loginError');

        if (!email || !password) {
            errorEl.textContent = 'E-posta ve şifre gerekli';
            return;
        }

        try {
            await this.auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            errorEl.textContent = 'Giriş başarısız: ' + error.message;
        }
    }

    async register() {
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const confirm = document.getElementById('registerConfirm').value;
        const errorEl = document.getElementById('registerError');

        if (!name || !email || !password) {
            errorEl.textContent = 'Tüm alanları doldurun';
            return;
        }

        if (password !== confirm) {
            errorEl.textContent = 'Şifreler eşleşmiyor';
            return;
        }

        try {
            const cred = await this.auth.createUserWithEmailAndPassword(email, password);
            await cred.user.updateProfile({ displayName: name });
            
            // Kullanıcı profili oluştur
            await this.db.collection('users').doc(cred.user.uid).set({
                uid: cred.user.uid,
                displayName: name,
                email: email,
                photoURL: 'https://via.placeholder.com/100',
                bio: 'Merhaba! NovaChat'teyim.',
                status: 'online',
                friends: [],
                friendRequests: [],
                servers: [],
                createdAt: timestamp()
            });
        } catch (error) {
            errorEl.textContent = 'Kayıt başarısız: ' + error.message;
        }
    }

    adminLogin() {
        const username = document.getElementById('adminUsername').value;
        const password = document.getElementById('adminPassword').value;
        const errorEl = document.getElementById('adminError');

        if (password === this.adminPassword) {
            // Admin girişi başarılı
            this.showAdminPanel();
            this.hideLoginScreen();
        } else {
            errorEl.textContent = 'Hatalı admin şifresi';
        }
    }

    async checkAdminStatus(user) {
        // Admin email kontrolü
        if (user && user.email === 'admin@novachat.com') {
            this.showAdminPanel();
        }
    }

    showAdminPanel() {
        document.getElementById('adminPanelModal').classList.add('show');
        this.loadAdminData();
    }

    async loadAdminData() {
        // Toplam kullanıcı
        const usersSnap = await this.db.collection('users').get();
        document.getElementById('adminTotalUsers').textContent = usersSnap.size;

        // Toplam sunucu
        const serversSnap = await this.db.collection('servers').get();
        document.getElementById('adminTotalServers').textContent = serversSnap.size;

        // Toplam mesaj
        const messagesSnap = await this.db.collection('messages').get();
        document.getElementById('adminTotalMessages').textContent = messagesSnap.size;

        // Kullanıcı listesi
        const usersList = document.getElementById('adminUsersList');
        usersList.innerHTML = '';
        usersSnap.forEach(doc => {
            const user = doc.data();
            usersList.innerHTML += `
                <div class="admin-user-item">
                    <img src="${user.photoURL}" width="32" height="32" style="border-radius:50%">
                    <span>${user.displayName}</span>
                    <span>${user.email}</span>
                    <button class="btn-danger btn-small" onclick="app.banUser('${doc.id}')">Banla</button>
                </div>
            `;
        });
    }

    hideLoginScreen() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
    }

    // ========== KULLANICI VERİLERİ ==========
    async loadUserData() {
        const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
        if (userDoc.exists) {
            const user = userDoc.data();
            document.getElementById('currentUserName').textContent = user.displayName;
            document.getElementById('currentUserAvatar').src = user.photoURL;
            document.getElementById('currentUserStatus').className = `user-status ${user.status}`;
            
            const statusText = { online: '🟢 Çevrimiçi', idle: '🌙 Boşta', dnd: '⛔ Rahatsız Etme', invisible: '⚫ Görünmez' };
            document.getElementById('currentUserStatus').textContent = statusText[user.status] || '🟢 Çevrimiçi';
        }
    }

    // ========== SUNUCU İŞLEMLERİ ==========
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

    async loadChannels(serverId) {
        const serverDoc = await this.db.collection('servers').doc(serverId).get();
        const server = serverDoc.data();
        const channelList = document.getElementById('channelList');
        const voiceList = document.getElementById('voiceChannelList');
        
        channelList.innerHTML = '';
        voiceList.innerHTML = '';
        
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
                    document.getElementById('currentChannelName').textContent = `# ${channel}`;
                });
                
                channelList.appendChild(div);
            });
        }

        if (server.voiceChannels) {
            server.voiceChannels.forEach(channel => {
                const div = document.createElement('div');
                div.className = 'channel-item';
                div.innerHTML = `<i class="fas fa-volume-up"></i> ${channel}`;
                
                div.addEventListener('click', () => {
                    this.joinVoiceChannel(serverId, channel);
                });
                
                voiceList.appendChild(div);
            });
        }
    }

    async createServer() {
        const name = prompt('Sunucu adı:');
        if (!name) return;

        await this.db.collection('servers').add({
            name: name,
            ownerId: this.currentUser.uid,
            createdAt: timestamp(),
            channels: ['genel'],
            voiceChannels: ['Sohbet Odası'],
            members: [this.currentUser.uid]
        });

        this.loadServers();
    }

    async createChannel() {
        if (!this.currentServer) {
            alert('Önce bir sunucu seçin');
            return;
        }

        const name = prompt('Kanal adı:');
        if (!name) return;

        await this.db.collection('servers').doc(this.currentServer).update({
            channels: firebase.firestore.FieldValue.arrayUnion(name)
        });

        this.loadChannels(this.currentServer);
    }

    async createVoiceChannel() {
        if (!this.currentServer) {
            alert('Önce bir sunucu seçin');
            return;
        }

        const name = prompt('Ses kanalı adı:');
        if (!name) return;

        await this.db.collection('servers').doc(this.currentServer).update({
            voiceChannels: firebase.firestore.FieldValue.arrayUnion(name)
        });

        this.loadChannels(this.currentServer);
    }

    // ========== KEŞFET ==========
    async discoverServers() {
        document.getElementById('discoverModal').classList.add('show');
        
        const serversRef = this.db.collection('servers');
        const snapshot = await serversRef.get();
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
                    <button class="btn-small" onclick="app.joinServer('${doc.id}')">Katıl</button>
                </div>
            `;
        });
    }

    async joinServer(serverId) {
        await this.db.collection('servers').doc(serverId).update({
            members: firebase.firestore.FieldValue.arrayUnion(this.currentUser.uid)
        });
        
        await this.db.collection('users').doc(this.currentUser.uid).update({
            servers: firebase.firestore.FieldValue.arrayUnion(serverId)
        });

        document.getElementById('discoverModal').classList.remove('show');
        this.loadServers();
    }

    // ========== MESAJLAŞMA ==========
    listenMessages(serverId, channel) {
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
            
            container.scrollTop = container.scrollHeight;
        });
        
        this.unsubscribes.push(unsub);
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        if (!text) return;
        
        if (this.currentDM) {
            await this.db.collection('dmMessages').add({
                dmId: this.currentDM,
                senderId: this.currentUser.uid,
                senderName: this.currentUser.displayName,
                senderAvatar: this.currentUser.photoURL,
                content: text,
                timestamp: timestamp()
            });
            
            await this.db.collection('dms').doc(this.currentDM).update({
                lastMessage: text,
                lastMessageTime: timestamp()
            });
        } else if (this.currentServer && this.currentChannel) {
            await this.db.collection('messages').add({
                serverId: this.currentServer,
                channel: this.currentChannel,
                senderId: this.currentUser.uid,
                senderName: this.currentUser.displayName,
                senderAvatar: this.currentUser.photoURL,
                content: text,
                timestamp: timestamp()
            });
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

    // ========== DM SİSTEMİ ==========
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
                
                if (!user) return;
                
                const div = document.createElement('div');
                div.className = `dm-item ${dm.id === this.currentDM ? 'active' : ''}`;
                div.dataset.id = doc.id;
                div.innerHTML = `
                    <img src="${user.photoURL}" class="dm-avatar" onerror="this.src='https://via.placeholder.com/100'">
                    <div class="dm-info">
                        <div class="dm-name">${user.displayName}</div>
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
                    <img src="${user.photoURL}" onerror="this.src='https://via.placeholder.com/100'">
                    <div>
                        <div>${user.displayName}</div>
                        <small>${user.email}</small>
                    </div>
                    <button class="btn-small" onclick="app.startDMWithUser('${user.uid}')">Mesaj Gönder</button>
                `;
                
                results.appendChild(div);
            }
        });
    }

    async startDMWithUser(userId) {
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
        
        this.unsubscribes.forEach(unsub => unsub());
        this.unsubscribes = [];
        
        document.getElementById('currentServerName').textContent = 'Direkt Mesaj';
        document.querySelectorAll('.dm-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`.dm-item[data-id="${dmId}"]`)?.classList.add('active');
        
        const userDoc = await this.db.collection('users').doc(otherUserId).get();
        const user = userDoc.data();
        document.getElementById('currentChannelName').textContent = `@${user.displayName}`;
        
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

    // ========== ARKADAŞLIK SİSTEMİ ==========
    async loadFriends() {
        const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
        const user = userDoc.data();
        
        if (user.friendRequests && user.friendRequests.length > 0) {
            document.getElementById('requestBadge').style.display = 'inline';
            document.getElementById('requestBadge').textContent = user.friendRequests.length;
        }
    }

    async sendFriendRequest(userId) {
        await this.db.collection('users').doc(userId).update({
            friendRequests: firebase.firestore.FieldValue.arrayUnion(this.currentUser.uid)
        });
    }

    async acceptFriendRequest(userId) {
        // İstekten kaldır
        await this.db.collection('users').doc(this.currentUser.uid).update({
            friendRequests: firebase.firestore.FieldValue.arrayRemove(userId),
            friends: firebase.firestore.FieldValue.arrayUnion(userId)
        });
        
        await this.db.collection('users').doc(userId).update({
            friends: firebase.firestore.FieldValue.arrayUnion(this.currentUser.uid)
        });
    }

    async rejectFriendRequest(userId) {
        await this.db.collection('users').doc(this.currentUser.uid).update({
            friendRequests: firebase.firestore.FieldValue.arrayRemove(userId)
        });
    }

    showFriendRequests() {
        document.getElementById('friendRequestsModal').classList.add('show');
        this.loadFriendRequestsList();
    }

    async loadFriendRequestsList() {
        const userDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
        const user = userDoc.data();
        const list = document.getElementById('friendRequestsList');
        list.innerHTML = '';
        
        for (const requestId of (user.friendRequests || [])) {
            const userDoc = await this.db.collection('users').doc(requestId).get();
            const requester = userDoc.data();
            
            list.innerHTML += `
                <div class="friend-request-item">
                    <img src="${requester.photoURL}" width="40" height="40" style="border-radius:50%">
                    <div>
                        <strong>${requester.displayName}</strong>
                        <small>${requester.email}</small>
                    </div>
                    <button class="btn-small" onclick="app.acceptFriendRequest('${requestId}')">Onayla</button>
                    <button class="btn-small btn-danger" onclick="app.rejectFriendRequest('${requestId}')">Reddet</button>
                </div>
            `;
        }
    }

    // ========== PROFİL SİSTEMİ ==========
    async openProfileModal(userId = null) {
        const profileUserId = userId || this.currentUser.uid;
        this.currentProfileUser = profileUserId;
        
        document.getElementById('profileModal').classList.add('show');
        
        const userDoc = await this.db.collection('users').doc(profileUserId).get();
        const user = userDoc.data();
        
        document.getElementById('modalProfileAvatar').src = user.photoURL;
        document.getElementById('modalProfileName').textContent = user.displayName;
        document.getElementById('modalProfileEmail').textContent = user.email;
        document.getElementById('modalProfileBio').textContent = user.bio || 'Kendinizden bahsedin...';
        document.getElementById('modalProfileStatus').value = user.status || 'online';
        document.getElementById('modalFriendCount').textContent = user.friends?.length || 0;
        document.getElementById('modalServerCount').textContent = user.servers?.length || 0;
        
        // Kendi profili mi kontrol et
        const isOwnProfile = (profileUserId === this.currentUser.uid);
        document.getElementById('editNameBtn').style.display = isOwnProfile ? 'inline' : 'none';
        document.getElementById('editBioBtn').style.display = isOwnProfile ? 'inline' : 'none';
        document.getElementById('changeAvatarBtn').style.display = isOwnProfile ? 'inline' : 'none';
        document.getElementById('logoutBtn').style.display = isOwnProfile ? 'block' : 'none';
        
        // Arkadaşlık durumu
        if (!isOwnProfile) {
            const currentUserDoc = await this.db.collection('users').doc(this.currentUser.uid).get();
            const currentUser = currentUserDoc.data();
            
            const isFriend = currentUser.friends?.includes(profileUserId);
            const hasRequest = currentUser.friendRequests?.includes(profileUserId);
            
            document.getElementById('friendStatusRow').style.display = 'block';
            document.getElementById('friendActionBtn').style.display = 'inline';
            
            if (isFriend) {
                document.getElementById('friendStatus').textContent = '✅ Arkadaşsınız';
                document.getElementById('friendActionBtn').textContent = 'Arkadaşlıktan Çıkar';
                document.getElementById('friendActionBtn').onclick = () => this.removeFriend(profileUserId);
            } else if (hasRequest) {
                document.getElementById('friendStatus').textContent = '⏳ İstek gönderildi';
                document.getElementById('friendActionBtn').textContent = 'İsteği Onayla';
                document.getElementById('friendActionBtn').onclick = () => this.acceptFriendRequest(profileUserId);
            } else {
                document.getElementById('friendStatus').textContent = '❌ Arkadaş değil';
                document.getElementById('friendActionBtn').textContent = 'Arkadaş Ekle';
                document.getElementById('friendActionBtn').onclick = () => this.sendFriendRequest(profileUserId);
            }
        }
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

    // ========== ÜYE LİSTESİ ==========
    async loadMembers(serverId) {
        const serverDoc = await this.db.collection('servers').doc(serverId).get();
        const server = serverDoc.data();
        const membersList = document.getElementById('membersList');
        membersList.innerHTML = '';
        
        if (server.members) {
            for (const memberId of server.members) {
                const userDoc = await this.db.collection('users').doc(memberId).get();
                const user = userDoc.data();
                
                const div = document.createElement('div');
                div.className = 'member-item';
                div.innerHTML = `
                    <img src="${user.photoURL}" class="member-avatar" onerror="this.src='https://via.placeholder.com/100'">
                    <span class="member-name">${user.displayName}</span>
                    <span class="member-status ${user.status}"></span>
                `;
                
                div.addEventListener('click', () => {
                    this.openProfileModal(memberId);
                });
                
                membersList.appendChild(div);
            }
        }
        
        document.getElementById('onlineCount').textContent = server.members?.length || 0;
    }

    // ========== SESLİ/GÖRÜNTÜLÜ ARAMA ==========
    async startCall(userId, video = false) {
        this.currentCall = {
            targetUserId: userId,
            video: video
        };
        
        document.getElementById('callModal').classList.add('show');
        
        // Kullanıcı bilgilerini göster
        const userDoc = await this.db.collection('users').doc(userId).get();
        const user = userDoc.data();
        document.getElementById('callUserName').textContent = user.displayName;
        document.getElementById('callAvatar').src = user.photoURL;
        
        if (video) {
            document.getElementById('videoContainer').style.display = 'flex';
            document.getElementById('toggleVideoBtn').style.display = 'inline';
        }
        
        document.getElementById('toggleAudioBtn').style.display = 'inline';
        document.getElementById('endCallBtn').style.display = 'inline';
        document.getElementById('rejectCallBtn').style.display = 'none';
        document.getElementById('acceptCallBtn').style.display = 'none';
        
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: true, 
                video: video 
            });
            
            if (video) {
                document.getElementById('localVideo').srcObject = this.localStream;
            }
            
            // WebRTC bağlantısı kur
            this.setupPeerConnection();
            
        } catch (error) {
            alert('Kamera/mikrofon erişimi yok');
        }
    }

    setupPeerConnection() {
        // WebRTC konfigürasyonu
        const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        this.peerConnection = new RTCPeerConnection(config);
        
        // Local stream'i ekle
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });
        
        // Remote stream'i bekle
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            document.getElementById('remoteVideo').srcObject = this.remoteStream;
        };
        
        // ICE candidate
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // Firebase üzerinden karşı tarafa gönder
                this.sendIceCandidate(event.candidate);
            }
        };
    }

    joinVoiceChannel(serverId, channelName) {
        alert(`${channelName} kanalına bağlanılıyor... Sesli sohbet başlatılıyor.`);
        this.startCall(this.currentUser.uid, false);
    }

    // ========== YARDIMCI ==========
    bindUIEvents() {
        // Sunucu oluştur
        document.getElementById('addServerBtn').addEventListener('click', () => this.createServer());
        
        // Kanal oluştur
        document.getElementById('addChannelBtn').addEventListener('click', () => this.createChannel());
        
        // Ses kanalı oluştur
        document.getElementById('addVoiceChannelBtn').addEventListener('click', () => this.createVoiceChannel());
        
        // Keşfet
        document.getElementById('discoverBtn').addEventListener('click', () => this.discoverServers());
        
        // Yeni DM
        document.getElementById('newDmBtn').addEventListener('click', () => {
            document.getElementById('newDmModal').classList.add('show');
            document.getElementById('dmUserSearch').focus();
        });
        
        document.getElementById('dmUserSearch').addEventListener('input', (e) => {
            this.searchUsers(e.target.value);
        });
        
        // Mesaj gönder
        document.getElementById('sendMessageBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        
        // Profil
        document.getElementById('openProfileBtn').addEventListener('click', () => this.openProfileModal());
        document.getElementById('modalProfileStatus').addEventListener('change', (e) => {
            this.updateStatus(e.target.value);
        });
        
        // Edit butonları
        document.getElementById('editNameBtn').addEventListener('click', () => this.editField('displayName'));
        document.getElementById('editBioBtn').addEventListener('click', () => this.editField('bio'));
        
        // Arkadaşlık
        document.getElementById('friendRequestsBtn').addEventListener('click', () => this.showFriendRequests());
        document.getElementById('friendsListBtn').addEventListener('click', () => {
            document.getElementById('friendsListModal').classList.add('show');
        });
        
        // Arama
        document.getElementById('voiceCallBtn').addEventListener('click', () => {
            if (this.currentDM) {
                const otherUserId = this.currentDM.split('_')[1];
                this.startCall(otherUserId, false);
            } else if (this.currentServer) {
                this.joinVoiceChannel(this.currentServer, 'genel');
            }
        });
        
        document.getElementById('videoCallBtn').addEventListener('click', () => {
            if (this.currentDM) {
                const otherUserId = this.currentDM.split('_')[1];
                this.startCall(otherUserId, true);
            }
        });
        
        // Ana sayfa
        document.getElementById('homeBtn').addEventListener('click', () => {
            this.currentServer = null;
            this.currentDM = null;
            document.getElementById('currentServerName').textContent = 'Ana Sayfa';
            document.getElementById('currentChannelName').textContent = '# genel';
            document.getElementById('channelList').innerHTML = '';
            document.getElementById('voiceChannelList').innerHTML = '';
            document.getElementById('messagesContainer').innerHTML = '<div style="text-align: center; margin-top: 50px; color: #72767d;">Bir sunucu veya DM seçin</div>';
            document.getElementById('membersList').innerHTML = '';
        });
        
        // Modal kapatma
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
            });
        });
        
        // Admin tab geçişleri
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.admin-list').forEach(l => l.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(`admin${tab.dataset.tab}List`).classList.add('active');
            });
        });
    }

    logout() {
        this.auth.signOut();
        window.location.reload();
    }
}

// Uygulamayı başlat
const app = new NovaChat();
window.app = app;
