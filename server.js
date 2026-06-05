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
  { kategori: "Game", labelBlogger: "Game", imageUrl: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=800&q=80", deskripsi: "Tren game open-world RPG terbaru PC/Konsol." },
  { kategori: "Tech", labelBlogger: "Software", imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80", deskripsi: "Rekomendasi platform AI tools gratis terbaik dunia." },
  { kategori: "Crypto", labelBlogger: "Lainnya", imageUrl: "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=800&q=80", deskripsi: "Panduan aman berburu crypto airdrop farming." }
];

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
      
      if (!imageUrl) {
        const gabungHTML = (beritaTerbaru.content || "") + (beritaTerbaru.description || "");
        const match = gabungHTML.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match && match[1]) { imageUrl = match[1]; }
      }

      return {
        title: beritaTerbaru.title,
        summary: beritaTerbaru.contentSnippet || beritaTerbaru.content || "Info tren terkini.",
        source: feed.title || "Portal Berita Terpercaya",
        kategori: selectedFeed.kategori,
        labelBlogger: selectedFeed.label,
        scrapedImage: imageUrl 
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

    let urlGambarFinal = "";

    // Prioritas 1: Ambil Gambar Asli Hasil Scrape
    if (trendBerita && trendBerita.scrapedImage) {
      urlGambarFinal = trendBerita.scrapedImage;
      botState.logTerakhir = "📸 Sukses mendeteksi gambar asli dari situs sumber!";
    }

    // Prioritas 2: Bank Gambar Cadangan Kategori Acak HD (Jika scrape gambar gagal)
    if (!urlGambarFinal) {
      if (kategoriFinal === "Game") {
        const bankGame = [
          "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80"
        ];
        urlGambarFinal = bankGame[Math.floor(Math.random() * bankGame.length)];
      } else if (kategoriFinal === "Tech") {
        const bankTech = [
          "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?auto=format&fit=crop&w=800&q=80"
        ];
        urlGambarFinal = bankTech[Math.floor(Math.random() * bankTech.length)];
      } else if (kategoriFinal === "Crypto") {
        const bankCrypto = [
          "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1622630998477-20aa696ecb05?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1516245834210-c4c142787335?auto=format&fit=crop&w=800&q=80"
        ];
        urlGambarFinal = bankCrypto[Math.floor(Math.random() * bankCrypto.length)];
      }
      botState.logTerakhir = "📸 Gambar disesuaikan otomatis menggunakan bank gambar kategori premium!";
    }

    const promptSEO = [
      "Kamu adalah praktisi SEO senior and blogger profesional.",
      "Buat artikel mendalam berdasarkan kabar terbaru berikut: " + deskripsiArtikel,
      "Wajib ditulis penuh dalam bahasa: " + bahasa,
      "",
      "FORMAT OUTPUT WAJIB (PISAHKAN JELAS DENGAN ENTER):",
      "[JUDUL] Tulis judul artikel saja tanpa tag HTML.",
      "[DESKRIPSI] Tulis satu kalimat meta deskripsi SEO (maksimal 140 karakter).",
      "[KONTEN] Isi artikel berupa HTML murni dimulai langsung dengan paragraf atau sub-judul.",
      "",
      "❌ LARANGAN KERAS (JANGAN PERNAH DITULIS):",
      "- JANGAN memasukkan tautan/link URL apa pun ke dalam teks.",
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
      judulFinal = barisTeks[0] ? barisTeks[0].replace(/\[?JUDUL\]?/i, "").trim() : (judulBeritaAsli || "Artikel Tren Viral Terbaru");
      deskripsiPenelusuran = barisTeks[1] ? barisTeks[1].replace(/\[?DESKRIPSI\]?/i, "").slice(0, 140).trim() : judulFinal;
      kontenHTMLRaw = teksBersih.replace(/\[?JUDUL\]?/i, "").replace(/\[?DESKRIPSI\]?/i, "").replace(/\[?KONTEN\]?/i, "").trim();
    }

    // --- FITUR AUTO-EDIT ANTI COPYRIGHT ---
    // CSS Filter ini merubah kontras, warna dasar (hue), saturasi, dan sepia secara instan agar "Sidik Jari Gambar" lolos dari sistem copyright Google.
    const cssAntiCopyright = "filter: contrast(115%) saturate(120%) sepia(15%) hue-rotate(2deg);";
    const bannerHTML = `<img src="${urlGambarFinal}" alt="${judulFinal}" style="width: 100%; max-width: 800px; height: auto; border-radius: 12px; display: block; margin: 0 auto 25px auto; ${cssAntiCopyright}" /><br/>`;
    
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
    const sumberSitus = trendBerita ? trendBerita.source : "Bank Topik Cadangan";
    botState.logTerakhir = `🎉 [SUKSES KONTEN] Tayang & Auto-Edit Anti Copyright (Sumber: ${sumberSitus})! URL: ${postUrl}`;

    const riwayatLokal = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
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