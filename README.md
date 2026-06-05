# bot-blogspot-viral

[ English Version Below | Versi Bahasa Indonesia di Bagian Bawah ]

---

## 🇺🇸 English Version

A Node.js automation bot to generate and post SEO articles to Blogger (Blogspot) using the Gemini API (via OpenAI compatibility layer).

The bot automatically creates articles in Indonesian and English alternately every 6 hours, generates a custom cover image using AI, and includes a local web dashboard to manage everything easily.

### Features
* **API Vault:** Save multiple API keys and hot-swap profiles directly from the web UI without restarting the server.
* **AI Image Banner:** Generates relevant cover images and automatically wraps them in a clean HTML/CSS banner overlay.
* **Clean HTML Output:** The system prompt is optimized to prevent raw markdown blocks (```) or broken tags from leaking into your Blogger posts.
* **Local Dashboard:** Simple web interface to monitor server uptime, RAM usage, and toggle the bot core engine.
* **Secure:** Your private credentials inside `.env` and `profiles.json` are strictly ignored by Git and will never be leaked to GitHub.

### Folder Structure
```text
BOT-BLOGSPOT-VIRAL/
├── public/
│   └── index.html          # Web Dashboard UI
├── .env                    # Local API Keys & Credentials
├── .env.example            # Environment Template Configuration
├── .gitignore              # Git Filter Rules
├── package.json            # Node.js dependencies
├── profiles.json           # Local API Vault Database (Auto-generated)
└── server.js               # Core Backend Script
```

### How to Install & Run

#### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

#### 2. Setup Project
Open your terminal and run these commands:
```bash
git clone https://github.com/khoirulr099/BOT-BLOGSPOT-VIRAL.git
cd BOT-BLOGSPOT-VIRAL
npm install
```

#### 3. Environment Configuration
Create a `.env` file in the root directory and fill it with your credentials:
```env
GEMINI_API_KEY=your_gemini_api_key
BLOGGER_BLOG_ID=your_blogger_id
GOOGLE_CLIENT_ID=your_oauth2_client_id
GOOGLE_CLIENT_SECRET=your_oauth2_client_secret
GOOGLE_REFRESH_TOKEN=your_oauth2_refresh_token
```

#### 4. Running the Bot
* **Development/Testing:**
```bash
  node server.js
  ```
* **Production (Run 24/7 in background using PM2):**

```bash
  npm install -g pm2
  pm2 start server.js --name "dashboard-blogger"
  ```

#### 5. Open Dashboard
Open your browser and go to: `http://localhost:3000`

---

## 🇮🇩 Versi Bahasa Indonesia

Bot otomatisasi berbasis Node.js untuk membuat dan memposting artikel SEO secara otomatis ke platform Blogger (Blogspot). 

Bot ini bakal memproduksi konten Bahasa Indonesia dan Inggris secara bergantian setiap 6 jam sekali, membuat gambar cover otomatis pakai AI, dan punya web dashboard lokal sendiri buat kontrol utamanya.

### Fitur Utama
* **Brankas API (Multi-Profile):** Bisa simpan banyak API Key sekaligus di dashboard. Tinggal klik buat ganti profil yang aktif tanpa perlu restart server.
* **Auto Gambar Cover:** Otomatis generate gambar yang sesuai dengan topik artikel dan dibungkus struktur HTML/CSS banner yang rapi sebelum terbit.
* **Output Teks Bersih:** Prompt sudah dikunci rapat agar AI tidak mengeluarkan tanda petik markdown (` 
``` `) atau tag eror di dalam postingan Blogger.
* **Web Panel Lokal:** Tampilan web simpel buat mantau sisa RAM laptop, waktu aktif server (uptime), serta tombol start/stop core engine bot.
* **Aman 100%:** File sensitif seperti `.env` dan `profiles.json` sudah dikunci di dalam `.gitignore` biar gak sengaja ke-upload ke publik.

### Cara Install & Jalankan

#### 1. Install Dependencies
Buka terminal di folder project kamu, lalu jalankan:
```bash
npm install
```

#### 2. Setup Kredensial (.env)
Buat file baru bernama `.env` di folder utama, lalu isi seperti ini:
```env
GEMINI_API_KEY=isi_api_key_gemini_kamu
BLOGGER_BLOG_ID=isi_id_blog_kamu
GOOGLE_CLIENT_ID=isi_client_id_oauth2
GOOGLE_CLIENT_SECRET=isi_client_secret_oauth2
GOOGLE_REFRESH_TOKEN=isi_refresh_token_oauth2
```

#### 3. Jalankan Bot di Background (PM2)
Biar bot tetap jalan terus di latar belakang laptop meskipun VS Code atau terminal ditutup, gunakan PM2:
```bash
npm install -g pm2
pm2 start server.js --name "dashboard-blogger"
```
* Untuk melihat log atau aktivitas bot secara live, ketik: `pm2 logs dashboard-blogger`

#### 4. Buka Web Kontrol
Buka browser kamu lalu akses alamat: `http://localhost:3000`
```
