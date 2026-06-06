import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Parser from "rss-parser"; 

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILES_FILE = path.join(__dirname, "profiles.json");
const HISTORY_FILE = path.join(__dirname, "history.json"); 
const startTime = Date.now();

// Konfigurasi Parser membawa identitas Browser Premium agar sukses masuk ke web anti-bot
const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media:content'],
      ['media:thumbnail', 'media:thumbnail'],
      ['enclosure', 'enclosure']
    ]
  },
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
});

if (!fs.existsSync(PROFILES_FILE)) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
}

let botState = {
  isRunning: false,
  engineStatus: "CORE IDLE (Standby)",
  nextPostTime: "Menunggu Mesin Dinyalakan",
  indeksJadwal: 0,
  logTerakhir: "Sistem Control Center Siap. Menunggu perintah jalankan mesin.",
  activeProfileName: "Belum Ada (Menggunakan Default .env)",
  config: {
    apiKey: process.env.GEMINI_API_KEY || "",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    textModel: "gemini-2.5-flash",
    imageModel: "dall-e-3",
    blogId: process.env.BLOGGER_BLOG_ID || "",
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || ""
  }
};

let botIntervalObject = null;
const JEDA_WAKTU = 6 * 60 * 60 * 1000; // 6 Jam

// --- SISTEM ANTREAN ADIL (ROUND-ROBIN) ---
const daftarLabelMenu = [
  "ANDROID", 
  "INSTALASI OS", 
  "JARINGAN", 
  "SOFTWARE", 
  "WEB DESAIN", 
  "GAME", 
  "LAINNYA"
];

// --- BANK TOPIK CADANGAN ---
const fallbackTopik = {
  "ANDROID": "Review HP Android terbaru, rekomendasi aplikasi Android, atau tips baterai awet.",
  "INSTALASI OS": "Tutorial instalasi Windows 11, cara dual-boot Linux dan Windows, atau mengatasi Blue Screen.",
  "JARINGAN": "Cara setting router Mikrotik, memperkuat sinyal WiFi, atau dasar-dasar keamanan jaringan.",
  "SOFTWARE": "Review software PC terbaru untuk produktivitas (bukan game), update browser, atau AI Tools desktop.",
  "WEB DESAIN": "Tutorial HTML/CSS, tren UI/UX terkini, atau cara menggunakan framework Tailwind CSS.",
  "GAME": "Review game PC/Konsol terbaru seperti PS4/PS5, tips push rank e-sports, atau update developer.",
  "LAINNYA": "Berita olahraga terkini (Sepak bola/MotoGP), tren Crypto/Web3, atau perkembangan teknologi AI."
};

async function fetchLatestTrend(targetLabel) {
  // --- MAPPING RSS FEED ---
  const targetFeeds = {
    "ANDROID": [
      "https://www.androidauthority.com/feed/"
    ],
    "INSTALASI OS": [
      "https://www.windowscentral.com/rss",
      "https://betanews.com/feed/"
    ],
    "JARINGAN": [
      "https://www.networkworld.com/feed/"
    ],
    "SOFTWARE": [
      "https://techcrunch.com/category/software/feed/",
      "https://www.theverge.com/software/rss/index.xml",
      "https://www.cnbcindonesia.com/tech/rss",
      "https://www.antaranews.com/rss/tekno.xml"
    ],
    "WEB DESAIN": [
      "https://css-tricks.com/feed/",
      "https://tympanus.net/codrops/feed/"
    ],
    "GAME": [
      "https://feeds.feedburner.com/ign/news",
      "https://kotaku.com/rss",
      "https://rss.detik.com/index.php/inet" 
    ],
    "LAINNYA": [
      "https://www.espn.com/espn/rss/news", 
      "https://cointelegraph.com/rss", 
      "https://www.coindesk.com/arc/outboundfeeds/rss/",
      "https://techcrunch.com/category/artificial-intelligence/feed/" 
    ]
  };

  try {
    const listFeeds = targetFeeds[targetLabel];
    const feedUrl = listFeeds[Math.floor(Math.random() * listFeeds.length)];
    
    console.log(`📡 Menghubungkan ke portal untuk label [${targetLabel}]: ${feedUrl}`);
    const feed = await parser.parseURL(feedUrl);
    
    if (feed.items && feed.items.length > 0) {
      const beritaTerbaru = feed.items[0];
      
      // Ambil gambar aslinya dengan berbagai cara scraping
      let imageUrl = "";
      if (beritaTerbaru.enclosure && beritaTerbaru.enclosure.url) {
        imageUrl = beritaTerbaru.enclosure.url;
      } else if (beritaTerbaru['media:content']) {
        const media = beritaTerbaru['media:content'];
        imageUrl = media.$ ? media.$.url : (Array.isArray(media) && media[0].$ ? media[0].$.url : "");
      } else if (beritaTerbaru['media:thumbnail']) {
        const thumb = beritaTerbaru['media:thumbnail'];
        imageUrl = thumb.$ ? thumb.$.url : "";
      }
      
      // Jika masih tidak ada, coba regex dari konten HTML-nya
      if (!imageUrl) {
        const gabungHTML = (beritaTerbaru.content || "") + (beritaTerbaru.description || "");
        const match = gabungHTML.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match && match[1]) { imageUrl = match[1]; }
      }

      return {
        title: beritaTerbaru.title,
        summary: beritaTerbaru.contentSnippet || beritaTerbaru.content || "Info tren terkini.",
        source: feed.title || feedUrl,
        scrapedImage: imageUrl
      };
    }
    return null;
  } catch (error) {
    console.error(`Gagal nge-scrape berita untuk label ${targetLabel}, beralih ke bank topik:`, error.message);
    return null;
  }
}

async function buatDanPostArtikelOtomatis() {
  const labelTargetHariIni = daftarLabelMenu[botState.indeksJadwal];
  
  try {
    botState.logTerakhir = `🤖 Mulai memproses artikel khusus untuk label: [${labelTargetHariIni}]`;
    
    const trendBerita = await fetchLatestTrend(labelTargetHariIni);
    
    let deskripsiArtikel = fallbackTopik[labelTargetHariIni];
    let judulBeritaAsli = "";
    
    if (trendBerita) {
      botState.logTerakhir = `📰 Berita ketemu dari [${trendBerita.source}]: ${trendBerita.title}`;
      deskripsiArtikel = `Berita hangat tentang: ${trendBerita.title}. Intisari fakta berita: ${trendBerita.summary}`;
      judulBeritaAsli = trendBerita.title;
    }

    let urlGambarFinal = "";

    // PRIORITAS UTAMA: Ambil gambar asli dari situs beritanya biar nyambung 100%
    if (trendBerita && trendBerita.scrapedImage) {
      urlGambarFinal = trendBerita.scrapedImage;
      botState.logTerakhir = "📸 Gambar ASLI DITEMUKAN! Siap diterapkan Filter Anti-Copyright.";
    }

    // FALLBACK: Hanya jika berita sama sekali tidak ada gambarnya, pakai Unsplash
    if (!urlGambarFinal) {
      const bankGambarBersih = {
        "ANDROID": ["https://images.unsplash.com/photo-1607252656733-fd7458c631f1?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=800&q=80"],
        "INSTALASI OS": ["https://images.unsplash.com/photo-1629654291663-b91ad427698f?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?auto=format&fit=crop&w=800&q=80"],
        "JARINGAN": ["https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80"],
        "SOFTWARE": ["https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?auto=format&fit=crop&w=800&q=80"],
        "WEB DESAIN": ["https://images.unsplash.com/photo-1507721999472-8ed4421c4af2?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1559028012-481c04fa702d?auto=format&fit=crop&w=800&q=80"],
        "GAME": ["https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&w=800&q=80"],
        "LAINNYA": ["https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=800&q=80"]
      };
      const daftarGambarPilihan = bankGambarBersih[labelTargetHariIni];
      urlGambarFinal = daftarGambarPilihan[Math.floor(Math.random() * daftarGambarPilihan.length)];
      botState.logTerakhir = `📸 Gagal scrape gambar. Pakai gambar HD pengganti untuk label ${labelTargetHariIni}.`;
    }

    const promptSEO = [
      "Kamu adalah penulis artikel blog teknologi dan umum profesional.",
      `Buat artikel mendalam berdasarkan kabar/topik berikut: ${deskripsiArtikel}`,
      "Wajib ditulis penuh dalam bahasa Indonesia.",
      "",
      `🔴 PENTING: Artikel ini WAJIB berfokus pada tema untuk label: ${labelTargetHariIni}.`,
      "Aturan Topik:",
      "- Jika label SOFTWARE: Bahas aplikasi, tools PC, atau OS. DILARANG KERAS membahas game/konsol.",
      "- Jika label GAME: Bahas game PC/Mobile, e-sports, atau konsol (PS4/PS5).",
      "- Jika label LAINNYA: Bahas berita Olahraga, Crypto, atau AI.",
      "",
      "🔴 ATURAN KERAPIAN TULISAN (HTML):",
      "- Tulisan DILARANG KERAS DEMPET. Gunakan struktur HTML yang rapi dan nyaman dibaca.",
      "- WAJIB bungkus setiap paragraf dengan tag <p>...</p>. Buat paragraf pendek (maksimal 3-4 kalimat per paragraf).",
      "- Gunakan tag <h2>...</h2> atau <h3>...</h3> untuk memisahkan setiap sub-judul.",
      "- Gunakan tag <ul><li>...</li></ul> jika ada poin-poin penjelasan.",
      "- Tambahkan spasi jarak antar bagian dengan tag <br><br> setelah penutup </p> atau penutup </ul> jika diperlukan.",
      "",
      "FORMAT OUTPUT WAJIB (PISAHKAN JELAS DENGAN ENTER):",
      "[JUDUL] Tulis judul artikel SEO-friendly tanpa tag HTML.",
      "[DESKRIPSI] Tulis satu kalimat meta deskripsi SEO (maksimal 140 karakter).",
      "[KONTEN] Isi artikel berupa HTML murni dimulai langsung dengan tag <p> atau <h2>.",
      "",
      "❌ LARANGAN KERAS (JANGAN PERNAH DITULIS):",
      "- JANGAN memasukkan tautan/link URL apa pun ke dalam teks.",
      "- JANGAN memasukkan tag luar seperti <html>, <head>, <body>, <!DOCTYPE>, atau tag <lang>.",
      "- JANGAN memasukkan footer, credit teks, nama penulis placeholder, atau tulisan 'Copyright'.",
      "- JANGAN menuliskan kata penutup penanda format seperti [AKHIR], [SELESAI], atau tanda petik tiga markdown (```)."
    ].join("\n");
    
    const resText = await fetch(botState.config.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + botState.config.apiKey
      },
      body: JSON.stringify({
        model: botState.config.textModel,
        messages: [{ role: "user", content: promptSEO }]
      })
    });

    const dataText = await resText.json();
    const responsTeks = dataText.choices[0].message.content.trim();

    const teksBersih = responsTeks.replace(/```html/gi, "").replace(/```/g, "").replace(/\*\*/g, "").trim();

    function ekstrakBagianIndependent(teks, kataKunci) {
      const regex = new RegExp(`(?:\\[?${kataKunci}\\]?:?)\\s*([\\s\\S]*?)(?=\\[?(?:JUDUL|DESKRIPSI|KONTEN)\\]?:?|$)`, "i");
      const match = teks.match(regex);
      return match ? match[1].trim() : "";
    }

    let judulFinal = ekstrakBagianIndependent(teksBersih, "JUDUL");
    let deskripsiPenelusuran = ekstrakBagianIndependent(teksBersih, "DESKRIPSI");
    let kontenHTMLRaw = ekstrakBagianIndependent(teksBersih, "KONTEN");

    if (!judulFinal || !kontenHTMLRaw) {
      const barisTeks = teksBersih.split("\n").filter(b => b.trim() !== "");
      judulFinal = barisTeks[0] ? barisTeks[0].replace(/\[?JUDUL\]?/i, "").trim() : (judulBeritaAsli || `Artikel Tren ${labelTargetHariIni}`);
      deskripsiPenelusuran = barisTeks[1] ? barisTeks[1].replace(/\[?DESKRIPSI\]?/i, "").slice(0, 140).trim() : judulFinal;
      kontenHTMLRaw = teksBersih.replace(/\[?JUDUL\]?/i, "").replace(/\[?DESKRIPSI\]?/i, "").replace(/\[?KONTEN\]?/i, "").trim();
    }

    // --- FITUR AUTO-EDIT GAMBAR (ANTI COPYRIGHT BYPASS) ---
    // Filter CSS ini akan "mencuci" gambar asli:
    // 1. Naikkan Kontras & Saturasi (Bikin sidik jari warna berubah)
    // 2. Tambah Sepia 10% (Perubahan tone dasar)
    // 3. Hue Rotate 2deg (Menggeser warna tanpa terlihat aneh oleh mata manusia)
    // 4. Transform: translateZ(0) (Memicu hardware acceleration agar gambar dirender ulang)
    const cssAntiCopyright = "filter: contrast(108%) saturate(115%) sepia(10%) hue-rotate(2deg) brightness(98%); transform: translateZ(0);";
    
    const bannerHTML = `
      <div style="overflow: hidden; border-radius: 12px; margin: 0 auto 25px auto; max-width: 800px;">
        <img src="${urlGambarFinal}" alt="${judulFinal}" style="width: 100%; height: auto; display: block; ${cssAntiCopyright}" />
      </div><br/>
    `;
    
    const kontenHTMLFinal = bannerHTML + kontenHTMLRaw;

    const oauth2Client = new google.auth.OAuth2(botState.config.clientId, botState.config.clientSecret, "[https://developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)");
    oauth2Client.setCredentials({ refresh_token: botState.config.refreshToken });
    const blogger = google.blogger({ version: "v3", auth: oauth2Client });

    const response = await blogger.posts.insert({
      blogId: botState.config.blogId,
      requestBody: {
        title: judulFinal,
        content: kontenHTMLFinal,
        labels: [labelTargetHariIni], 
        searchDescription: deskripsiPenelusuran
      }
    });

    const postUrl = response.data.url;
    botState.logTerakhir = `🎉 [SUKSES KONTEN] Masuk ke Label: ${labelTargetHariIni}! URL: ${postUrl}`;

    const riwayatLokal = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    riwayatLokal.push({
      id: response.data.id,
      title: judulFinal,
      url: postUrl,
      date: new Date().toLocaleDateString("id-ID"),
      label: labelTargetHariIni
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(riwayatLokal, null, 2));

  } catch (err) {
    botState.logTerakhir = `❌ Gagal Posting Label [${labelTargetHariIni}]: ` + err.message;
  }

  // Pindah Antrean ke Label Selanjutnya (Round Robin)
  botState.indeksJadwal = (botState.indeksJadwal + 1) % daftarLabelMenu.length;
  botState.nextPostTime = new Date(Date.now() + JEDA_WAKTU).toLocaleString("id-ID") + " WIB";
}

app.get("/api/status", (req, res) => {
  const diffMs = Date.now() - startTime;
  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  const memoryUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

  res.json({
    ...botState,
    systemUptime: hrs + " Jam " + mins + " Menit",
    systemMemory: memoryUsed + " MB"
  });
});

app.get("/api/analytics", (req, res) => {
  const historyData = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  const statistikTanggal = {};
  historyData.forEach(item => {
    statistikTanggal[item.date] = (statistikTanggal[item.date] || 0) + 1;
  });

  res.json({
    totalPosts: historyData.length,
    chartData: {
      labels: Object.keys(statistikTanggal),
      values: Object.values(statistikTanggal)
    },
    recentPosts: historyData.slice(-5).reverse() 
  });
});

app.get("/api/profiles", (req, res) => {
  const data = fs.readFileSync(PROFILES_FILE, "utf-8");
  res.json(JSON.parse(data));
});

app.post("/api/profiles", (req, res) => {
  const data = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
  const newProfile = { id: Date.now().toString(), ...req.body };
  data.push(newProfile);
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2));
  botState.logTerakhir = "📁 Profil API [" + newProfile.profileName + "] disimpan ke dalam Brankas.";
  res.json({ success: true, profiles: data });
});

app.post("/api/profiles/activate", (req, res) => {
  const { id } = req.body;
  const data = JSON.parse(fs.readFileSync(PROFILES_FILE, "utf-8"));
  const target = data.find(p => p.id === id);

  if (target) {
    botState.config.apiKey = target.apiKey;
    botState.config.baseUrl = target.baseUrl;
    botState.config.textModel = target.textModel;
    botState.config.imageModel = target.imageModel;
    botState.activeProfileName = target.profileName;
    botState.logTerakhir = "⚡ Sukses Beralih! Profil aktif sekarang: " + target.profileName;
    res.json({ success: true, state: botState });
  } else {
    res.status(404).json({ error: "Profil tidak ditemukan" });
  }
});

app.post("/api/control", (req, res) => {
  const { action } = req.body;
  if (action === "start") {
    if (!botState.isRunning) {
      botState.isRunning = true;
      botState.engineStatus = "CORE RUNNING (Active Loop)";
      botState.nextPostTime = new Date(Date.now() + JEDA_WAKTU).toLocaleString("id-ID") + " WIB";
      buatDanPostArtikelOtomatis();
      botIntervalObject = setInterval(buatDanPostArtikelOtomatis, JEDA_WAKTU);
    }
  } else if (action === "stop") {
    botState.isRunning = false;
    botState.engineStatus = "CORE STOPPED (Engine Pause)";
    botState.nextPostTime = "Mesin Dimatikan";
    clearInterval(botIntervalObject);
  }
  res.json(botState);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = 3000;
app.listen(PORT, "127.0.0.1", () => console.log("🚀 Dashboard OS mengudara aman di http://localhost:" + PORT));