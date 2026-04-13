const { createApp, ref, reactive, computed, onMounted, onUnmounted } = Vue;

const API_BASE = "/api";
const STORAGE_KEY_LIKED_POSTS = "diary_liked_posts";
const STORAGE_KEY_LIKED_COMMENTS = "diary_liked_comments";

const app = createApp({
  setup() {
    const posts = ref([]);
    const searchQuery = ref("");
    const showEditModal = ref(false);
    const showCommentModal = ref(false);
    const showSearchModal = ref(false);
    const showCreatePostModal = ref(false);
    const editingPost = ref(null);
    const selectedPostForComments = ref(null);
    const editForm = reactive({ content: "", mediaUrls: "", likes: 0 });
    const newCommentText = ref("");

    const newPost = reactive({
      content: "",
      mediaUrls: "",
      likes: 0,
    });

    const expandedPosts = ref(new Set());
    const videoObservers = new Map();
    const activeVideos = new Set();
    const videoElements = new Map();

    const getLikedPostsFromStorage = () => {
      try {
        return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_LIKED_POSTS) || "[]"));
      } catch {
        return new Set();
      }
    };

    const getLikedCommentsFromStorage = () => {
      try {
        return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_LIKED_COMMENTS) || "[]"));
      } catch {
        return new Set();
      }
    };

    const saveLikedPostsToStorage = (likedSet) => {
      localStorage.setItem(STORAGE_KEY_LIKED_POSTS, JSON.stringify([...likedSet]));
    };

    const saveLikedCommentsToStorage = (likedSet) => {
      localStorage.setItem(STORAGE_KEY_LIKED_COMMENTS, JSON.stringify([...likedSet]));
    };

    const likedPosts = ref(getLikedPostsFromStorage());
    const likedComments = ref(getLikedCommentsFromStorage());

    const formatNumber = (num) => {
      if (num < 1000) return num.toString();
      if (num < 1000000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
      return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    };

    const fetchPosts = async () => {
      try {
        const res = await axios.get(`${API_BASE}/posts`);
        posts.value = res.data.map((p) => ({
          ...p,
          showComments: false,
          currentMediaIndex: 0,
          mediaMuted: p.media_urls ? p.media_urls.map(() => true) : [],
          comments: p.comments || [],
          likedByUser: likedPosts.value.has(p.id),
        }));
        posts.value.forEach(post => {
          post.comments = post.comments.map(c => ({
            ...c,
            likedByUser: likedComments.value.has(c.id),
            likes: c.likes || 0,
          }));
        });
        setTimeout(() => setupVideoObservers(), 100);
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
        showCreatePostModal.value = false;
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
          likedPosts.value.delete(post.id);
        } else {
          await axios.post(`${API_BASE}/posts/${post.id}/like`);
          post.likes += 1;
          post.likedByUser = true;
          likedPosts.value.add(post.id);
        }
        saveLikedPostsToStorage(likedPosts.value);
      } catch (err) {
        console.error(err);
      }
    };

    const openEditModal = (post) => {
      editingPost.value = post;
      editForm.content = post.content;
      editForm.mediaUrls = post.media_urls ? post.media_urls.join(", ") : "";
      editForm.likes = post.likes;
      showEditModal.value = true;
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
        showEditModal.value = false;
        fetchPosts();
      } catch (err) {
        alert("Gagal menyimpan");
      }
    };

    const openCommentModal = (post) => {
      selectedPostForComments.value = post;
      newCommentText.value = "";
      showCommentModal.value = true;
    };

    const closeCommentModal = () => {
      showCommentModal.value = false;
      selectedPostForComments.value = null;
    };

    const addComment = async () => {
      if (!newCommentText.value.trim()) return;
      const post = selectedPostForComments.value;
      if (!post) return;
      try {
        await axios.post(`${API_BASE}/posts/${post.id}/comments`, {
          text: newCommentText.value,
        });
        await fetchPosts();
        const updatedPost = posts.value.find(p => p.id === post.id);
        if (updatedPost) selectedPostForComments.value = updatedPost;
        newCommentText.value = "";
      } catch (err) {
        alert("Gagal menambah komentar");
      }
    };

    const deleteComment = async (commentId) => {
      try {
        await axios.delete(`${API_BASE}/posts/comments/${commentId}`);
        await fetchPosts();
        if (selectedPostForComments.value) {
          const updatedPost = posts.value.find(p => p.id === selectedPostForComments.value.id);
          if (updatedPost) selectedPostForComments.value = updatedPost;
        }
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
          likedComments.value.delete(comment.id);
        } else {
          await axios.post(`${API_BASE}/posts/comments/${comment.id}/like`);
          comment.likes = (comment.likes || 0) + 1;
          comment.likedByUser = true;
          likedComments.value.add(comment.id);
        }
        saveLikedCommentsToStorage(likedComments.value);
      } catch (err) {
        console.error(err);
      }
    };

    const nextMedia = (post) => {
      if (post.media_urls && post.media_urls.length > 0) {
        if (post.currentMediaIndex < post.media_urls.length - 1) {
          post.currentMediaIndex++;
        }
      }
    };

    const prevMedia = (post) => {
      if (post.media_urls && post.media_urls.length > 0) {
        if (post.currentMediaIndex > 0) {
          post.currentMediaIndex--;
        }
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

    const openCreatePostModal = () => {
      showCreatePostModal.value = true;
    };

    const closeCreatePostModal = () => {
      showCreatePostModal.value = false;
      Object.assign(newPost, { content: "", mediaUrls: "", likes: 0 });
    };

    const handleVideoClick = (event, post, index) => {
      const video = event.currentTarget;
      if (video.paused) {
        pauseOtherVideos(video);
        video.play();
      } else {
        video.pause();
      }
    };

    const handleDoubleClickLike = (event, post) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const heart = document.createElement('div');
      heart.className = 'double-click-heart';
      heart.style.left = x + 'px';
      heart.style.top = y + 'px';
      heart.innerHTML = '<svg viewBox="0 0 24 24" fill="#f43f5e"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
      event.currentTarget.appendChild(heart);
      setTimeout(() => heart.remove(), 800);
      if (!post.likedByUser) {
        toggleLike(post);
      }
    };

    const setupVideoObservers = () => {
      videoObservers.forEach((observer, id) => observer.disconnect());
      videoObservers.clear();
      videoElements.clear();
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const video = entry.target;
          const postId = video.dataset.postId;
          const index = video.dataset.index;
          if (entry.isIntersecting) {
            pauseOtherVideos(video);
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      }, { threshold: 0.5 });
      document.querySelectorAll('video').forEach(video => {
        observer.observe(video);
        videoObservers.set(video.id, observer);
        videoElements.set(video.id, video);
      });
    };

    const pauseOtherVideos = (currentVideo) => {
      videoElements.forEach(video => {
        if (video !== currentVideo && !video.paused) {
          video.pause();
        }
      });
    };

    const handleVideoTouchSpeed = (event, video) => {
      if (!('ontouchstart' in window)) return;
      const rect = video.getBoundingClientRect();
      const touchX = event.touches[0].clientX - rect.left;
      if (touchX < rect.width / 2) {
        video.playbackRate = 2.0;
      }
    };

    const resetVideoSpeed = (video) => {
      video.playbackRate = 1.0;
    };

    onMounted(() => {
      fetchPosts();
    });

    onUnmounted(() => {
      videoObservers.forEach(observer => observer.disconnect());
    });

    const formatDate = (iso) =>
      new Date(iso).toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      });

    return {
      posts,
      searchQuery,
      newPost,
      showEditModal,
      showCommentModal,
      showSearchModal,
      showCreatePostModal,
      editForm,
      editingPost,
      selectedPostForComments,
      newCommentText,
      filteredPosts,
      totalStats,
      publishPost,
      deletePost,
      toggleLike,
      openEditModal,
      saveEdit,
      openCommentModal,
      closeCommentModal,
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
      openCreatePostModal,
      closeCreatePostModal,
      formatNumber,
      handleVideoClick,
      handleDoubleClickLike,
      handleVideoTouchSpeed,
      resetVideoSpeed,
    };
  },
  template: `
    <div class="container">
      <header class="header">
        <div class="brand">
          <h1>My Diary</h1>
        </div>
        <div class="header-actions">
          <div class="stats">
            <span class="stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg> {{ totalStats.posts }}</span>
            <span class="stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> {{ formatNumber(totalStats.likes) }}</span>
            <span class="stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> {{ formatNumber(totalStats.comments) }}</span>
          </div>
          <button class="add-post-btn" @click="openCreatePostModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="search-icon-btn" @click="showSearchModal = true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
      </header>

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
              <button class="menu-btn" @click.stop="post.showMenu = !post.showMenu">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              </button>
              <div v-if="post.showMenu" class="menu-dropdown">
                <button @click="deletePost(post.id)">Hapus</button>
              </div>
            </div>
          </div>

          <div v-if="post.media_urls && post.media_urls.length > 0" class="media-container small">
            <div class="media-slider" :style="{ transform: 'translateX(-' + (post.currentMediaIndex || 0) * 100 + '%)' }">
              <div v-for="(url, idx) in post.media_urls" class="media-slide">
                <img v-if="!isVideo(url)" :src="url" class="post-media" @dblclick="handleDoubleClickLike($event, post)">
                <div v-else class="video-wrapper" @dblclick="handleDoubleClickLike($event, post)">
                  <video :id="'video-'+post.id+'-'+idx" :data-post-id="post.id" :data-index="idx" :src="url" class="post-media" muted :autoplay="idx === post.currentMediaIndex" loop playsinline @click="handleVideoClick($event, post, idx)" @touchstart="handleVideoTouchSpeed($event, $event.target)" @touchend="resetVideoSpeed($event.target)" @touchcancel="resetVideoSpeed($event.target)"></video>
                  <button class="mute-btn" @click.stop="toggleMute(post, idx)">
                    <svg v-if="post.mediaMuted && post.mediaMuted[idx]" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  </button>
                </div>
              </div>
            </div>
            <button v-if="post.media_urls.length > 1 && post.currentMediaIndex > 0" class="slider-nav prev" @click.stop="prevMedia(post)">‹</button>
            <button v-if="post.media_urls.length > 1 && post.currentMediaIndex < post.media_urls.length - 1" class="slider-nav next" @click.stop="nextMedia(post)">›</button>
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
                <span v-if="post.likes > 0" class="like-count">{{ formatNumber(post.likes) }}</span>
              </div>
              <div class="comment-wrapper">
                <button class="action-btn" @click="openCommentModal(post)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </button>
                <span v-if="post.comments.length > 0" class="comment-count">{{ formatNumber(post.comments.length) }}</span>
              </div>
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

      <div v-if="showCreatePostModal" class="modal-overlay" @click.self="closeCreatePostModal">
        <div class="modal create-post-modal">
          <div class="modal-header">
            <h3>Buat Postingan Baru</h3>
            <button @click="closeCreatePostModal" class="modal-close-btn">
              <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="form-group">
            <label>Deskripsi</label>
            <textarea v-model="newPost.content" placeholder="Masukkan deskripsi..."></textarea>
          </div>
          <div class="form-row">
            <div><label>URL Media</label><input v-model="newPost.mediaUrls" placeholder="https://...jpg, https://...mp4"></div>
            <div><label>Jumlah Like</label><input type="number" min="0" v-model.number="newPost.likes"></div>
          </div>
          <div class="modal-actions">
            <button @click="closeCreatePostModal" class="btn">Batal</button>
            <button @click="publishPost" class="btn btn-primary">Terbitkan</button>
          </div>
        </div>
      </div>

      <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal=false">
        <div class="modal edit-modal">
          <div class="modal-header">
            <h3>Edit Postingan</h3>
            <button @click="showEditModal=false" class="modal-close-btn">
              <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <textarea v-model="editForm.content" rows="5"></textarea>
          <input v-model="editForm.mediaUrls" placeholder="URL Media (pisah koma)">
          <input type="number" min="0" v-model.number="editForm.likes" placeholder="Jumlah Like">
          <div class="modal-actions">
            <button @click="showEditModal=false" class="btn">Batal</button>
            <button @click="saveEdit" class="btn btn-primary">Simpan</button>
          </div>
        </div>
      </div>

      <div v-if="showCommentModal" class="modal-overlay" @click.self="closeCommentModal">
        <div class="modal comment-modal">
          <div class="modal-header">
            <h3>Komentar</h3>
            <button @click="closeCommentModal" class="modal-close-btn">
              <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <ul class="comment-list">
            <li v-for="c in selectedPostForComments?.comments" :key="c.id" class="comment-item">
              <div class="comment-content">
                <span class="username">neverlabs</span> {{ c.text }}
                <div class="comment-actions">
                  <button class="comment-like" @click="toggleCommentLike(c)">
                    <svg v-if="c.likedByUser" width="14" viewBox="0 0 24 24" fill="#f43f5e"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    <svg v-else width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    Suka
                  </button>
                  <button class="comment-reply">Balas</button>
                </div>
              </div>
              <button @click="deleteComment(c.id)" class="delete-comment">
                <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </li>
          </ul>
          <div class="add-comment">
            <input v-model="newCommentText" placeholder="Tulis komentar..." @keyup.enter="addComment">
            <button class="send-btn" @click="addComment">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div v-if="showSearchModal" class="modal-overlay" @click.self="showSearchModal=false">
        <div class="modal search-modal">
          <div class="modal-header">
            <h3>Cari</h3>
            <button @click="showSearchModal=false" class="modal-close-btn">
              <svg width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="search-input-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="searchQuery" placeholder="Cari postingan..." autofocus>
          </div>
        </div>
      </div>
    </div>
  `,
});

app.mount("#app");
