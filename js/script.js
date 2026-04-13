const { createApp, ref, reactive, computed, onMounted } = Vue;

const API_BASE = "/api";

const app = createApp({
  setup() {
    const posts = ref([]);
    const searchQuery = ref("");
    const sortBy = ref("newest");
    const showModal = ref(false);
    const editingPost = ref(null);
    const editForm = reactive({ content: "", mediaUrls: "", likes: 0 });

    const newPost = reactive({
      content: "",
      mediaUrls: "",
      likes: 0,
    });

    const expandedPosts = ref(new Set());

    const fetchPosts = async () => {
      try {
        const res = await axios.get(`${API_BASE}/posts`);
        posts.value = res.data.map((p) => ({
          ...p,
          showComments: false,
          currentMediaIndex: 0,
          mediaMuted: p.media_urls ? p.media_urls.map(() => true) : [],
          comments: p.comments || [],
        }));
      } catch (err) {
        console.error(err);
      }
    };

    const extractTags = (text) => {
      const matches = text.match(/#(\w+)/g) || [];
      return matches.map((tag) => tag.slice(1).toLowerCase());
    };

    const filteredPosts = computed(() => {
      let result = [...posts.value];
      if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase();
        result = result.filter((p) => p.content.toLowerCase().includes(q));
      }
      if (sortBy.value === "newest")
        result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      if (sortBy.value === "oldest")
        result.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      if (sortBy.value === "mostLiked")
        result.sort((a, b) => b.likes - a.likes);
      if (sortBy.value === "mostCommented")
        result.sort((a, b) => b.comments.length - a.comments.length);
      return result;
    });

    const totalStats = computed(() => {
      const totalLikes = posts.value.reduce((acc, p) => acc + p.likes, 0);
      const totalComments = posts.value.reduce(
        (acc, p) => acc + p.comments.length,
        0,
      );
      return {
        posts: posts.value.length,
        likes: totalLikes,
        comments: totalComments,
      };
    });

    const publishPost = async () => {
      if (!newPost.content.trim() || newPost.content.length < 3)
        return alert("Deskripsi minimal 3 karakter");
      const mediaArray = newPost.mediaUrls
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u !== "");
      const extractedTags = extractTags(newPost.content);
      try {
        await axios.post(`${API_BASE}/posts`, {
          content: newPost.content,
          mediaUrls: mediaArray,
          tags: extractedTags,
          likes: Number(newPost.likes) || 0,
        });
        Object.assign(newPost, { content: "", mediaUrls: "", likes: 0 });
        fetchPosts();
      } catch (err) {
        alert("Gagal mempublikasikan");
      }
    };

    const deletePost = async (id) => {
      if (!confirm("Hapus postingan ini?")) return;
      try {
        await axios.delete(`${API_BASE}/posts/${id}`);
        fetchPosts();
      } catch (err) {
        alert("Gagal menghapus");
      }
    };

    const toggleLike = async (post) => {
      try {
        if (post.likedByUser) {
          await axios.post(`${API_BASE}/posts/${post.id}/unlike`);
          post.likes = Math.max(0, post.likes - 1);
          post.likedByUser = false;
        } else {
          await axios.post(`${API_BASE}/posts/${post.id}/like`);
          post.likes += 1;
          post.likedByUser = true;
        }
      } catch (err) {
        console.error(err);
      }
    };

    const openEditModal = (post) => {
      editingPost.value = post;
      editForm.content = post.content;
      editForm.mediaUrls = post.media_urls ? post.media_urls.join(", ") : "";
      editForm.likes = post.likes;
      showModal.value = true;
    };

    const saveEdit = async () => {
      if (!editingPost.value) return;
      const mediaArray = editForm.mediaUrls
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u !== "");
      const extractedTags = extractTags(editForm.content);
      try {
        await axios.put(`${API_BASE}/posts/${editingPost.value.id}`, {
          content: editForm.content,
          mediaUrls: mediaArray,
          tags: extractedTags,
          likes: Number(editForm.likes),
        });
        showModal.value = false;
        fetchPosts();
      } catch (err) {
        alert("Gagal menyimpan");
      }
    };

    const addComment = async (postId, commentText, parentId = null) => {
      if (!commentText.trim()) return;
      try {
        await axios.post(`${API_BASE}/posts/${postId}/comments`, {
          text: commentText,
          parentId,
        });
        fetchPosts();
      } catch (err) {
        alert("Gagal menambah komentar");
      }
    };

    const deleteComment = async (commentId) => {
      try {
        await axios.delete(`${API_BASE}/posts/comments/${commentId}`);
        fetchPosts();
      } catch (err) {
        alert("Gagal menghapus komentar");
      }
    };

    const toggleCommentLike = async (comment) => {
      try {
        if (comment.likedByUser) {
          await axios.post(`${API_BASE}/posts/comments/${comment.id}/unlike`);
          comment.likes = Math.max(0, (comment.likes || 0) - 1);
          comment.likedByUser = false;
        } else {
          await axios.post(`${API_BASE}/posts/comments/${comment.id}/like`);
          comment.likes = (comment.likes || 0) + 1;
          comment.likedByUser = true;
        }
      } catch (err) {
        console.error(err);
      }
    };

    const nextMedia = (post) => {
      if (post.media_urls && post.media_urls.length > 0) {
        post.currentMediaIndex =
          (post.currentMediaIndex + 1) % post.media_urls.length;
      }
    };

    const prevMedia = (post) => {
      if (post.media_urls && post.media_urls.length > 0) {
        post.currentMediaIndex =
          (post.currentMediaIndex - 1 + post.media_urls.length) %
          post.media_urls.length;
      }
    };

    const toggleMute = (post, index) => {
      if (!post.mediaMuted) post.mediaMuted = post.media_urls.map(() => true);
      post.mediaMuted[index] = !post.mediaMuted[index];
      const video = document.getElementById(`video-${post.id}-${index}`);
      if (video) video.muted = post.mediaMuted[index];
    };

    const isVideo = (url) => {
      return (
        /\.(mp4|webm|ogg|mov|m3u8|avi|mkv)($|\?)/i.test(url) ||
        url.includes("video")
      );
    };

    const toggleExpand = (postId) => {
      if (expandedPosts.value.has(postId)) {
        expandedPosts.value.delete(postId);
      } else {
        expandedPosts.value.add(postId);
      }
    };

    const truncateContent = (content, maxLength = 100) => {
      if (content.length <= maxLength) return content;
      return content.substring(0, maxLength) + "...";
    };

    onMounted(fetchPosts);

    const formatDate = (iso) =>
      new Date(iso).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      });

    return {
      posts,
      searchQuery,
      sortBy,
      newPost,
      showModal,
      editForm,
      editingPost,
      filteredPosts,
      totalStats,
      publishPost,
      deletePost,
      toggleLike,
      openEditModal,
      saveEdit,
      addComment,
      deleteComment,
      formatDate,
      nextMedia,
      prevMedia,
      toggleMute,
      isVideo,
      expandedPosts,
      toggleExpand,
      truncateContent,
      toggleCommentLike,
    };
  },
  template: `
    <div class="container">
      <header class="header">
        <div class="brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
          <h1>My Diary</h1>
        </div>
        <div class="stats">
          <span class="stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg> {{ totalStats.posts }}</span>
          <span class="stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> {{ totalStats.likes }}</span>
          <span class="stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> {{ totalStats.comments }}</span>
        </div>
      </header>

      <div class="creator-card">
        <div class="form-group">
          <label>Deskripsi</label>
          <textarea v-model="newPost.content" placeholder="Tulis isi hati..."></textarea>
        </div>
        <div class="form-row">
          <div><label>URL Media (pisah koma)</label><input v-model="newPost.mediaUrls" placeholder="https://...jpg, https://...mp4"></div>
          <div><label>Jumlah Like</label><input type="number" min="0" v-model.number="newPost.likes"></div>
        </div>
        <div style="display:flex; gap:1rem; justify-content:flex-end">
          <button class="btn btn-outline" @click="newPost = {content:'', mediaUrls:'', likes:0}">Bersihkan</button>
          <button class="btn btn-primary" @click="publishPost">Terbitkan</button>
        </div>
      </div>

      <div class="controls">
        <div class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="searchQuery" placeholder="Cari...">
        </div>
        <div class="filter-group">
          <select v-model="sortBy">
            <option value="newest">Terbaru</option>
            <option value="oldest">Terlama</option>
            <option value="mostLiked">Terbanyak Suka</option>
            <option value="mostCommented">Terbanyak Komentar</option>
          </select>
        </div>
      </div>

      <div class="feed">
        <div v-if="filteredPosts.length === 0" class="empty-state">Belum ada postingan.</div>
        <div v-for="post in filteredPosts" :key="post.id" class="post-card">
          <div class="post-user">
            <div class="avatar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="8" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
            </div>
            <div class="user-info">
              <span class="username">neverlabs</span>
              <span class="timestamp">{{ formatDate(post.timestamp) }}</span>
            </div>
            <div class="post-menu">
              <button class="menu-btn" @click.stop="post.showMenu = !post.showMenu">•••</button>
              <div v-if="post.showMenu" class="menu-dropdown">
                <button @click="deletePost(post.id)">Hapus</button>
              </div>
            </div>
          </div>

          <div v-if="post.media_urls && post.media_urls.length > 0" class="media-container small">
            <div class="media-slider" :style="{ transform: 'translateX(-' + (post.currentMediaIndex || 0) * 100 + '%)' }">
              <div v-for="(url, idx) in post.media_urls" class="media-slide">
                <img v-if="!isVideo(url)" :src="url" class="post-media" @dblclick="toggleLike(post)">
                <div v-else class="video-wrapper">
                  <video :id="'video-'+post.id+'-'+idx" :src="url" class="post-media" muted :autoplay="idx === post.currentMediaIndex" loop playsinline @dblclick="toggleLike(post)"></video>
                  <button class="mute-btn" @click.stop="toggleMute(post, idx)">
                    <svg v-if="post.mediaMuted && post.mediaMuted[idx]" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  </button>
                </div>
              </div>
            </div>
            <button v-if="post.media_urls.length > 1" class="slider-nav prev" @click.stop="prevMedia(post)">‹</button>
            <button v-if="post.media_urls.length > 1" class="slider-nav next" @click.stop="nextMedia(post)">›</button>
            <div v-if="post.media_urls.length > 1" class="slider-dots">
              <span v-for="(u, i) in post.media_urls" :key="i" class="dot" :class="{ active: i === (post.currentMediaIndex || 0) }" @click="post.currentMediaIndex = i"></span>
            </div>
          </div>

          <div v-if="!post.media_urls || post.media_urls.length === 0" class="post-content">
            <span class="username">neverlabs</span>
            <span v-if="expandedPosts.has(post.id) || post.content.length <= 100">{{ post.content }}</span>
            <span v-else>{{ truncateContent(post.content) }}</span>
            <button v-if="post.content.length > 100" class="expand-btn" @click="toggleExpand(post.id)">
              {{ expandedPosts.has(post.id) ? 'Lebih sedikit...' : 'Selengkapnya...' }}
            </button>
          </div>

          <div class="post-actions">
            <div class="action-group">
              <div class="like-wrapper">
                <button class="action-btn" @click="toggleLike(post)">
                  <svg v-if="post.likedByUser" viewBox="0 0 24 24" fill="#f43f5e" stroke="#f43f5e"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                </button>
                <span v-if="post.likes > 0" class="like-count">{{ post.likes }}</span>
              </div>
              <button class="action-btn" @click="post.showComments = !post.showComments">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </button>
              <button class="action-btn" @click="openEditModal(post)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
              </button>
            </div>
            <button class="action-btn save-modern">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>

          <div v-if="post.media_urls && post.media_urls.length > 0" class="post-content">
            <span class="username">neverlabs</span>
            <span v-if="expandedPosts.has(post.id) || post.content.length <= 100">{{ post.content }}</span>
            <span v-else>{{ truncateContent(post.content) }}</span>
            <button v-if="post.content.length > 100" class="expand-btn" @click="toggleExpand(post.id)">
              {{ expandedPosts.has(post.id) ? 'Lebih sedikit...' : 'Selengkapnya...' }}
            </button>
          </div>

          <div v-if="post.showComments" class="comment-section">
            <ul class="comment-list">
              <li v-for="c in post.comments" :key="c.id" class="comment-item">
                <div class="comment-content">
                  <span class="username">neverlabs</span> {{ c.text }}
                  <div class="comment-actions">
                    <button class="comment-like" @click="toggleCommentLike(c)">
                      <svg v-if="c.likedByUser" width="12" viewBox="0 0 24 24" fill="#f43f5e"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      <svg v-else width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      Suka
                    </button>
                    <button class="comment-reply">Balas</button>
                  </div>
                </div>
                <button @click="deleteComment(c.id)" class="delete-comment">🗑️</button>
              </li>
            </ul>
            <div class="add-comment">
              <input :id="'comment-'+post.id" placeholder="Tulis komentar..." @keyup.enter="addComment(post.id, $event.target.value); $event.target.value=''">
              <button class="send-btn" @click="addComment(post.id, document.getElementById('comment-'+post.id).value); document.getElementById('comment-'+post.id).value=''">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer class="footer">
        <span>© 2026 Neverlabs. All rights reserved.</span>
        <div class="social-links">
          <a href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>
          <a href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg></a>
          <a href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg></a>
          <a href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg></a>
          <a href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg></a>
          <a href="#"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></a>
        </div>
      </footer>

      <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
        <div class="modal">
          <div class="modal-header"><h3>Edit Postingan</h3><button @click="showModal=false" class="btn-outline"><svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
          <textarea v-model="editForm.content" rows="5"></textarea>
          <input v-model="editForm.mediaUrls" placeholder="URL Media (pisah koma)" class="mt-2">
          <input type="number" min="0" v-model.number="editForm.likes" placeholder="Jumlah Like" class="mt-2">
          <div style="display:flex; gap:1rem; justify-content:flex-end; margin-top:1.5rem">
            <button @click="showModal=false" class="btn">Batal</button>
            <button @click="saveEdit" class="btn btn-primary">Simpan</button>
          </div>
        </div>
      </div>
    </div>
  `,
});

app.mount("#app");
