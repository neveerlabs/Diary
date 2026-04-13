# My Diary

Aplikasi jurnal pribadi modern dengan fitur posting gambar/video, like, komentar, dengan tampilan ala Instagram.

## Prasyarat

- [Node.js](https://nodejs.org/) (versi 14 atau lebih baru)
- [MySQL](https://www.mysql.com/) (versi 5.7 atau lebih baru)

## Instalasi & Menjalankan

1. **Clone Repositori:**
   ```bash
   git clone https://github.com/neveerlabs/Diary.git
   ```
3. Masuk ke folder `backend`:
   ```bash
   cd backend
   ```
4. Install Dependensi:
   ```bash
   npm install
   ```
5. Setup file `.env` di dalam folder `backend` dengan isi:
   ```bash
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=diary
   PORT=5000
   ```
   > *Sesuaikan `DB_USER` dan `DB_PASSWORD` dengan kredensial MySQL.*
6. Buat database dan tabel di MySQL (lihat bagian Konfigurasi Database).
7. Jalankan server backend:
   ```bash
   npm run dev
   ```
   atau
   ```bash
   npm start
   ```
8. Buka browser dan masuk ke `http://localhost:5000`

### Konfigurasi Database

Database tidak dibuat otomatis. Anda harus membuat database dan tabel secara manual.

Jalankan perintah SQL berikut di MySQL (misalnya via phpMyAdmin, MySQL Workbench, atau command line):
```sql
CREATE DATABASE diary;
USE diary;

CREATE TABLE posts (
  id VARCHAR(30) PRIMARY KEY,
  content TEXT NOT NULL,
  media_urls JSON,
  tags JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  likes INT DEFAULT 0
);

CREATE TABLE comments (
  id VARCHAR(30) PRIMARY KEY,
  post_id VARCHAR(30) NOT NULL,
  text TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  likes INT DEFAULT 0,
  parent_id VARCHAR(30) DEFAULT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS post_likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id VARCHAR(50) NOT NULL,
  user_ip VARCHAR(45) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_like (post_id, user_ip)
);

CREATE TABLE IF NOT EXISTS comment_likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  comment_id VARCHAR(50) NOT NULL,
  user_ip VARCHAR(45) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_comment_like (comment_id, user_ip)
);
```
> *Setelah tabel dibuat, aplikasi siap digunakan.*

---

### Catatan
* Semua data postingan dan komentar disimpan di database `diary`.
* Like postingan dan komentar dapat diatur langsung melalui frontend (termasuk nilai awal).
* Server backend juga menyajikan file statis (HTML, CSS, JS) sehingga cukup akses `http://localhost:5000`.

### Aspek Keamanan
Aplikasi **Diary Feed** dirancang dengan mempertimbangkan prinsip-prinsip keamanan dasar untuk mencegah eksploitasi umum pada aplikasi web. Berikut rincian langkah-langkah keamanan yang diimplementasikan:

1. Perlindungan terhadap SQL Injection
Seluruh interaksi dengan basis data MySQL dilakukan melalui **parameterized query** menggunakan pustaka `mysql2`. Tidak ada satu pun input pengguna yang digabungkan secara langsung ke dalam string SQL. Setiap nilai dari klien dilewatkan melalui placeholder (`?`), sehingga upaya injeksi perintah SQL tidak akan berhasil.
```javascript
await db.query('INSERT INTO post_likes (post_id, user_ip) VALUES (?, ?)', [postId, userIp]);
```

2. Pembatasan Laju Permintaan (Rate Limiting)
Untuk mencegah serangan *brute‑force* dan penyalahgunaan API, diterapkan pembatasan jumlah permintaan menggunakan `express-rate-limit`. Setiap alamat IP hanya diizinkan melakukan **maksimal 200 permintaan dalam rentang 15 menit** ke seluruh *endpoint* `/api/*`. Jika batas terlampaui, server akan mengembalikan respons `429 Too Many Requests`.

3. Validasi dan Sanitasi Input
* Konten postingan wajib memiliki panjang minimal 3 karakter sebelum disimpan.
* Komentar tidak boleh kosong atau hanya berisi spasi.
* Data yang diterima dari klien dipangkas (`trim()`) untuk menghindari penyimpanan karakter yang tidak perlu.
* Meskipun validasi URL media tidak dilakukan secara ketat, URL hanya disimpan sebagai teks dan tidak dieksekusi oleh server, sehingga risiko *Server‑Side Request Forgery* (SSRF) minimal.

4. Pencegahan XSS (Cross‑Site Scripting)
Antarmuka pengguna dibangun dengan **Vue.js**. Secara bawaan, Vue melakukan *escaping* terhadap semua konten yang dirender dari data dinamis. Dengan demikian, meskipun pengguna mencoba menyisipkan tag HTML atau skrip berbahaya ke dalam konten postingan atau komentar, kode tersebut tidak akan dieksekusi oleh peramban.

5. Penyimpanan Status "Like" Berbasis IP
Karena aplikasi belum menerapkan sistem autentikasi pengguna, status "like" pada postingan dan komentar diidentifikasi menggunakan **alamat IP** pengguna. Data like disimpan dalam tabel terpisah (`post_likes` dan `comment_likes`) dengan kombinasi `(post_id, user_ip)` yang bersifat unik. Pendekatan ini memastikan satu pengguna hanya dapat memberikan satu like per konten, sekaligus mencegah manipulasi jumlah like secara lokal karena tidak ada data yang disimpan di `localStorage`.

6. Pengamanan Header HTTP
Middleware **Helmet.js** digunakan untuk menyetel berbagai header HTTP yang meningkatkan keamanan, seperti `X-Content-Type-Options`, `X-Frame-Options`, dan `X-XSS-Protection`. Saat ini kebijakan *Content Security Policy* (CSP) dinonaktifkan untuk kemudahan pengembangan, namun dapat diaktifkan kembali untuk lingkungan produksi.

7. Penanganan Error yang Tidak Membocorkan Informasi
Setiap kesalahan yang terjadi pada sisi server (misalnya kegagalan koneksi basis data) dicatat secara internal melalui fungsi `logError`, tetapi respons yang dikirimkan ke klien hanya berupa pesan umum seperti `Internal server error` atau `Failed to retrieve posts`. Praktik ini mencegah penyerang memperoleh detail teknis yang dapat digunakan untuk eksploitasi lebih lanjut.

8. Batasan Ukuran Payload
Ukuran body permintaan JSON dan URL‑encoded dibatasi hingga **5 MB** untuk mencegah serangan *Denial‑of‑Service* (DoS) melalui pengiriman data berukuran besar.

9. Rekomendasi untuk Produksi
Meskipun fondasi keamanan sudah cukup baik, untuk penerapan di lingkungan produksi disarankan untuk:

* Mengaktifkan **Content Security Policy** (CSP) pada Helmet.
* Membatasi **CORS** hanya ke domain yang diizinkan.
* Menggunakan **HTTPS** untuk mengenkripsi komunikasi antara klien dan server.
* Menerapkan sistem **autentikasi pengguna** agar identifikasi tidak hanya bergantung pada alamat IP (yang dapat berubah atau dibagikan).
--

Kesimpulan:
Aplikasi ini telah mengadopsi praktik keamanan standar industri untuk mencegah kerentanan umum. Dengan konfigurasi yang tepat pada lingkungan produksi, sistem dapat beroperasi dengan tingkat keamanan yang memadai untuk aplikasi *micro‑blogging* pribadi maupun skala kecil.

---

<div align="center">
   © 2026 Neverlabs. All rights reserved.
   
   [![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://instagram.com/neveerlabs)
   [![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/neveerlabs)
   [![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/Neverlabs)
   [![WhatsApp](https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://wa.me/628561765372)
</div>
