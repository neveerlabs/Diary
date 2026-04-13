const express = require('express');
const router = express.Router();
const db = require('../db');

function getTimestamp() {
  const now = new Date();
  const options = {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false
  };
  return now.toLocaleString('en-US', options).replace(' at', '');
}
function logInfo(msg) { console.log(`[${getTimestamp()}] [INFO]: ${msg}`); }
function logError(msg) { console.error(`[${getTimestamp()}] [ERROR]: ${msg}`); }

const getUserIdentifier = (req) => {
  return req.ip || req.connection.remoteAddress || 'unknown';
};

router.get('/', async (req, res) => {
  try {
    const userIp = getUserIdentifier(req);
    const [posts] = await db.query(`SELECT id, content, media_urls, tags, timestamp, likes FROM posts ORDER BY timestamp DESC`);
    for (const post of posts) {
      const [comments] = await db.query('SELECT id, text, timestamp FROM comments WHERE post_id = ? ORDER BY timestamp ASC', [post.id]);
      post.media_urls = post.media_urls ? JSON.parse(post.media_urls) : [];
      post.tags = post.tags ? JSON.parse(post.tags) : [];
      post.comments = comments;

      const [liked] = await db.query('SELECT 1 FROM post_likes WHERE post_id = ? AND user_ip = ?', [post.id, userIp]);
      post.likedByUser = liked.length > 0;

      for (const comment of post.comments) {
        const [commentLiked] = await db.query('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_ip = ?', [comment.id, userIp]);
        comment.likedByUser = commentLiked.length > 0;
        const [likeCount] = await db.query('SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?', [comment.id]);
        comment.likes = likeCount[0].count;
      }
    }
    res.json(posts);
  } catch (error) {
    logError(`Failed to fetch posts: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve posts' });
  }
});

router.post('/', async (req, res) => {
  const { content, mediaUrls, tags, likes } = req.body;
  if (!content || content.trim().length < 3) return res.status(400).json({ error: 'Content min 3 chars' });
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2,6);
  const mediaJson = JSON.stringify(mediaUrls || []);
  const tagsJson = JSON.stringify(tags || []);
  const initialLikes = typeof likes === 'number' && likes >= 0 ? likes : 0;
  try {
    await db.query('INSERT INTO posts (id, content, media_urls, tags, likes) VALUES (?,?,?,?,?)',
      [id, content.trim(), mediaJson, tagsJson, initialLikes]);
    const [newPost] = await db.query('SELECT * FROM posts WHERE id = ?', [id]);
    newPost[0].media_urls = JSON.parse(newPost[0].media_urls);
    newPost[0].tags = JSON.parse(newPost[0].tags);
    newPost[0].comments = [];
    newPost[0].likedByUser = false;
    logInfo(`Post created: ${id}`);
    res.status(201).json(newPost[0]);
  } catch (error) {
    logError(`Create post failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { content, mediaUrls, tags, likes } = req.body;
  try {
    const updates = [], values = [];
    if (content !== undefined) { updates.push('content = ?'); values.push(content.trim()); }
    if (mediaUrls !== undefined) { updates.push('media_urls = ?'); values.push(JSON.stringify(mediaUrls)); }
    if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)); }
    if (likes !== undefined && typeof likes === 'number' && likes >= 0) { updates.push('likes = ?'); values.push(likes); }
    if (updates.length === 0) return res.status(400).json({ error: 'No changes' });
    values.push(id);
    await db.query(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`, values);
    const [updated] = await db.query('SELECT * FROM posts WHERE id = ?', [id]);
    if (!updated.length) return res.status(404).json({ error: 'Not found' });
    updated[0].media_urls = JSON.parse(updated[0].media_urls);
    updated[0].tags = JSON.parse(updated[0].tags);
    logInfo(`Post updated: ${id}`);
    res.json(updated[0]);
  } catch (error) {
    logError(`Update failed: ${error.message}`);
    res.status(500).json({ error: 'Update failed' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM comments WHERE post_id = ?', [id]);
    await db.query('DELETE FROM post_likes WHERE post_id = ?', [id]);
    const [result] = await db.query('DELETE FROM posts WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Not found' });
    logInfo(`Post deleted: ${id}`);
    res.json({ message: 'Deleted' });
  } catch (error) {
    logError(`Delete failed: ${error.message}`);
    res.status(500).json({ error: 'Delete failed' });
  }
});

router.post('/:id/like', async (req, res) => {
  const postId = req.params.id;
  const userIp = getUserIdentifier(req);
  try {
    const [existing] = await db.query('SELECT 1 FROM post_likes WHERE post_id = ? AND user_ip = ?', [postId, userIp]);
    if (existing.length === 0) {
      await db.query('INSERT INTO post_likes (post_id, user_ip) VALUES (?, ?)', [postId, userIp]);
      await db.query('UPDATE posts SET likes = likes + 1 WHERE id = ?', [postId]);
    }
    const [post] = await db.query('SELECT likes FROM posts WHERE id = ?', [postId]);
    res.json({ likes: post[0].likes, likedByUser: true });
  } catch (error) {
    logError(`Like failed: ${error.message}`);
    res.status(500).json({ error: 'Like failed' });
  }
});

router.post('/:id/unlike', async (req, res) => {
  const postId = req.params.id;
  const userIp = getUserIdentifier(req);
  try {
    const [result] = await db.query('DELETE FROM post_likes WHERE post_id = ? AND user_ip = ?', [postId, userIp]);
    if (result.affectedRows > 0) {
      await db.query('UPDATE posts SET likes = GREATEST(likes - 1, 0) WHERE id = ?', [postId]);
    }
    const [post] = await db.query('SELECT likes FROM posts WHERE id = ?', [postId]);
    res.json({ likes: post[0].likes, likedByUser: false });
  } catch (error) {
    logError(`Unlike failed: ${error.message}`);
    res.status(500).json({ error: 'Unlike failed' });
  }
});

router.get('/:id/comments', async (req, res) => {
  try {
    const [comments] = await db.query('SELECT * FROM comments WHERE post_id = ? ORDER BY timestamp DESC', [req.params.id]);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/:id/comments', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Empty' });
  const commentId = Date.now().toString(36) + Math.random().toString(36).substring(2,6);
  try {
    await db.query('INSERT INTO comments (id, post_id, text) VALUES (?,?,?)', [commentId, req.params.id, text.trim()]);
    const [newComment] = await db.query('SELECT * FROM comments WHERE id = ?', [commentId]);
    res.status(201).json(newComment[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.delete('/comments/:commentId', async (req, res) => {
  const { commentId } = req.params;
  try {
    await db.query('DELETE FROM comment_likes WHERE comment_id = ?', [commentId]);
    await db.query('DELETE FROM comments WHERE id = ?', [commentId]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/comments/:commentId/like', async (req, res) => {
  const { commentId } = req.params;
  const userIp = getUserIdentifier(req);
  try {
    const [existing] = await db.query('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_ip = ?', [commentId, userIp]);
    if (existing.length === 0) {
      await db.query('INSERT INTO comment_likes (comment_id, user_ip) VALUES (?, ?)', [commentId, userIp]);
    }
    const [count] = await db.query('SELECT COUNT(*) as likes FROM comment_likes WHERE comment_id = ?', [commentId]);
    res.json({ likes: count[0].likes, likedByUser: true });
  } catch (error) {
    logError(`Like comment failed: ${error.message}`);
    res.status(500).json({ error: 'Failed' });
  }
});

router.post('/comments/:commentId/unlike', async (req, res) => {
  const { commentId } = req.params;
  const userIp = getUserIdentifier(req);
  try {
    await db.query('DELETE FROM comment_likes WHERE comment_id = ? AND user_ip = ?', [commentId, userIp]);
    const [count] = await db.query('SELECT COUNT(*) as likes FROM comment_likes WHERE comment_id = ?', [commentId]);
    res.json({ likes: count[0].likes, likedByUser: false });
  } catch (error) {
    logError(`Unlike comment failed: ${error.message}`);
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
