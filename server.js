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

// Konfigurasi Parser membawa identitas Browser Premium agar tidak diblokir server (Anti-ECONNRESET)
const parser = new Parser({
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
  logTerakhir: "Sistem Control Center Siap. Silakan pilih atau tambah profil API.",
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
const JEDA_WAKTU = 6 * 60 * 60 * 1000; 
const jadwalHarian = ["Indonesia", "English", "Indonesia", "English"];

const daftarTopik = [
  { kategori: "Game", labelBlogger: "Game", imageUrl: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800", deskripsi: "Tren game open-world RPG terbaru PC/Konsol." },
  { kategori: "Tech", labelBlogger: "Software", imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800", deskripsi: "Rekomendasi platform AI tools gratis terbaik dunia." },
  { kategori: "Crypto", labelBlogger: "Lainnya", imageUrl: "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=800", deskripsi: "Panduan aman berburu crypto airdrop farming." }
];

// REFACTOR: Scraper mengembalikan kategori data secara akurat agar gambar selalu sinkron
async function fetchLatestTrend(bahasa) {
  const targetFeeds = {
    Indonesia: [
      { url: "https://www.cnbcindonesia.com/tech/rss", kategori: "Tech", label: "Software" },
      { url: "https://rss.detik.com/index.php/inet", kategori: "Game", label: "Game" },
      { url: "https://www.antaranews.com/rss/tekno.xml", kategori: "Tech", label: "Software" }
    ],
    English: [
      { url: "https://feeds.feedburner.com/ign/news", kategori: "Game", label: "Game" },
      { url: "https://www.theverge.com/rss/index.xml", kategori: "Tech", label: "Software" },
      { url: "https://techcrunch.com/feed/", kategori: "Tech", label: "Software" },
      { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", kategori: "Crypto", label: "Lainnya" }
    ]
  };

  try {
    const listFeeds = targetFeeds[bahasa] || targetFeeds["English"];
    const selectedFeed = listFeeds[Math.floor(Math.random() * listFeeds.length)];
    
    console.log(`📡 Menghubungkan ke portal: ${selectedFeed.url}`);
    const feed = await parser.parseURL(selectedFeed.url);
    
    if (feed.items && feed.items.length > 0) {
      const beritaTerbaru = feed.items[0];
      return {
        title: beritaTerbaru.title,
        summary: beritaTerbaru.contentSnippet || beritaTerbaru.content || "Info tren terkini.",
        source: feed.title || "Portal Berita Terpercaya",
        kategori: selectedFeed.kategori,
        labelBlogger: selectedFeed.label
      };
    }
    return null;
  } catch (error) {
    console.error("Gagal nge-scrape berita tren, beralih ke bank topik:", error.message);
    return null;
  }
}

async function buatDanPostArtikelOtomatis() {
  const bahasa = jadwalHarian[botState.indeksJadwal];
  const topikFallback = daftarTopik[Math.floor(Math.random() * daftarTopik.length)];
  
  try {
    botState.logTerakhir = "🤖 Mencari berita berita terbaru untuk bahasa: " + bahasa;
    
    const trendBerita = await fetchLatestTrend(bahasa);
    
    let deskripsiArtikel = topikFallback.deskripsi;
    let judulBeritaAsli = "";
    let kategoriFinal = topikFallback.kategori;
    let labelBloggerFinal = topikFallback.labelBlogger;
    
    if (trendBerita) {
      botState.logTerakhir = `📰 Berita ketemu dari [${trendBerita.source}]: ${trendBerita.title}`;
      deskripsiArtikel = `Berita hangat tentang: ${trendBerita.title}. Intisari fakta berita: ${trendBerita.summary}`;
      judulBeritaAsli = trendBerita.title;
      kategoriFinal = trendBerita.kategori;
      labelBloggerFinal = trendBerita.labelBlogger;
    }

    // FIX 1: Penentuan Gambar default disesuaikan dengan rumpun topik berita asli (Anti-Salah Gambar)
    let urlGambarFinal = "https://images.unsplash.com/photo-1495020689067-958852a6565d?q=80&w=800"; // Berita Umum
    if (kategoriFinal === "Game") {
      urlGambarFinal = "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800";
    } else if (kategoriFinal === "Tech") {
      urlGambarFinal = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800"; // Gambar luar angkasa/sains/teknologi
    } else if (kategoriFinal === "Crypto") {
      urlGambarFinal = "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=800";
    }

    if (botState.config.apiKey && botState.config.imageModel && !botState.config.baseUrl.includes("googleapis.com")) {
      try {
        botState.logTerakhir = "🎨 Memanggil model [" + botState.config.imageModel + "] untuk generate gambar...";
        const resImg = await fetch(botState.config.baseUrl.replace(/\/$/, "") + "/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + botState.config.apiKey
          },
          body: JSON.stringify({
            model: botState.config.imageModel,
            prompt: "Cinematic high-tech digital art banner about " + (judulBeritaAsli || topikFallback.deskripsi) + ", 4k resolution, clean sharp style",
            n: 1,
            size: "1024x1024"
          })
        });
        const dataImg = await resImg.json();
        if (dataImg.data && dataImg.data[0] && dataImg.data[0].url) {
          urlGambarFinal = dataImg.data[0].url;
          botState.logTerakhir = "📸 Gambar kustom berhasil digenerate oleh AI!";
        }
      } catch (err) {
        console.error("Gagal generate gambar kustom, beralih ke gambar rumpun topik.", err.message);
      }
    }

    const riwayatLokal = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    let instruksiInternalLink = "";
    
    if (riwayatLokal.length > 0) {
      const tautanTersedia = riwayatLokal.slice(-3).map(art => `- Judul: "${art.title}" -> URL Link: ${art.url}`).join("\n");
      instruksiInternalLink = [
        "\n🔗 STRATEGI SMART SEO INTERNAL LINKING:",
        "Kamu diwajibkan menyisipkan minimal 1 atau maksimal 2 link dari daftar artikel lama kami di bawah ini secara natural ke dalam kata atau frasa yang relevan di dalam paragraf artikel baru (Gunakan tag murni <a href='URL'>teks frasa</a>):",
        tautanTersedia,
        "Pastikan penempatannya mengalir alami dan tidak dipaksakan."
      ].join("\n");
    }

    const promptSEO = [
      "Kamu adalah praktisi SEO senior dan blogger profesional.",
      "Buat artikel mendalam berdasarkan kabar terbaru berikut: " + deskripsiArtikel,
      "Wajib ditulis penuh dalam bahasa: " + bahasa,
      instruksiInternalLink,
      "",
      "FORMAT OUTPUT WAJIB (PISAHKAN JELAS DENGAN ENTER):",
      "[JUDUL] Tulis judul artikel saja tanpa tag HTML.",
      "[DESKRIPSI] Tulis satu kalimat meta deskripsi SEO (maksimal 140 karakter).",
      "[KONTEN] Isi artikel berupa HTML murni dimulai langsung dengan paragraf atau sub-judul.",
      "",
      "❌ LARANGAN KERAS (JANGAN PERNAH DITULIS):",
      "- JANGAN memasukkan tag luar seperti <html>, <head>, <body>, <!DOCTYPE>, atau tag <lang>.",
      "- JANGAN memasukkan footer, credit teks, nama penulis placeholder, atau tulisan 'Copyright © 2023'.",
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

    const responsBersih = responsTeks.replace(/\*\*/g, ""); 
    
    const bagianJudul = responsBersih.match(/(?:\[?JUDUL\]?:?)([\s\S]*?)(?:\[?DESKRIPSI\]?:?)/i);
    const bagianDeskripsi = responsBersih.match(/(?:\[?DESKRIPSI\]?:?)([\s\S]*?)(?:\[?KONTEN\]?:?)/i);
    const bagianKonten = responsBersih.match(/(?:\[?KONTEN\]?:?)([\s\S]*)/i);

    if (!bagianJudul || !bagianDeskripsi || !bagianKonten) {
      throw new Error("Pola balasan model teks tidak valid.");
    }

    const tigaPetik = String.fromCharCode(96, 96, 96);
    const judulFinal = bagianJudul[1].split(tigaPetik).join("").split("html").join("").trim();
    const deskripsiPenelusuran = bagianDeskripsi[1].trim();
    const kontenHTMLRaw = bagianKonten[1].split(tigaPetik).join("").split("html").join("").trim();

    // FIX 2: Struktur HTML diubah memakai kelas 'separator' resmi Blogger agar dibaca sempurna sebagai Thumbnail oleh Tema Blog
    const bannerHTML = [
      `<div class="separator" style="clear: both; text-align: center; margin-bottom: 25px;">`,
      `  <img border="0" src="${urlGambarFinal}" alt="${judulFinal}" style="margin-left: auto; margin-right: auto; width: 100%; max-width: 800px; height: auto; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);" />`,
      `</div><br/>`
    ].join("\n");

    const kontenHTMLFinal = bannerHTML + kontenHTMLRaw;

    const oauth2Client = new google.auth.OAuth2(botState.config.clientId, botState.config.clientSecret, "[https://developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)");
    oauth2Client.setCredentials({ refresh_token: botState.config.refreshToken });
    const blogger = google.blogger({ version: "v3", auth: oauth2Client });

    const response = await blogger.posts.insert({
      blogId: botState.config.blogId,
      requestBody: {
        title: judulFinal,
        content: kontenHTMLFinal,
        labels: [labelBloggerFinal],
        searchDescription: deskripsiPenelusuran
      }
    });

    const postUrl = response.data.url;
    botState.logTerakhir = "🎉 [SUKSES KONTEN] Berhasil tayang di blog! URL: " + postUrl;

    riwayatLokal.push({
      id: response.data.id,
      title: judulFinal,
      url: postUrl,
      date: new Date().toLocaleDateString("id-ID"),
      lang: bahasa
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(riwayatLokal, null, 2));

  } catch (err) {
    botState.logTerakhir = "❌ Kegagalan Siklus Konten: " + err.message;
  }

  botState.indeksJadwal = (botState.indeksJadwal + 1) % jadwalHarian.length;
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