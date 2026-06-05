import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILES_FILE = path.join(__dirname, "profiles.json");
const startTime = Date.now();

// Memastikan file penyimpanan profil lokal tersedia otomatis
if (!fs.existsSync(PROFILES_FILE)) {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify([], null, 2));
}

// State manajemen internal server & dashboard
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
const JEDA_WAKTU = 6 * 60 * 60 * 1000; // 6 Jam interval loop
const jadwalHarian = ["Indonesia", "English", "Indonesia", "English"];

// Bank Topik Berdasarkan Tag Kategori Asli Blog Kamu
const daftarTopik = [
  { kategori: "Game", labelBlogger: "Game", imageUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800", deskripsi: "Tren game open-world RPG terbaru PC/Konsol.", keywordsID: "game terbaru, open world RPG", keywordsEN: "latest games, open world RPG" },
  { kategori: "AI", labelBlogger: "Software", imageUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?q=80&w=800", deskripsi: "Rekomendasi platform AI tools gratis terbaik.", keywordsID: "AI tools gratis, platform AI", keywordsEN: "free AI tools, best AI" },
  { kategori: "Crypto", labelBlogger: "Lainnya", imageUrl: "https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=800", deskripsi: "Panduan aman berburu crypto airdrop farming.", keywordsID: "crypto terbaru, airdrop farming", keywordsEN: "latest crypto, airdrop farming" }
];

// Logika Pembuatan Konten SEO & Gambar Otomatis
async function buatDanPostArtikelOtomatis() {
  const bahasa = jadwalHarian[botState.indeksJadwal];
  const topik = daftarTopik[Math.floor(Math.random() * daftarTopik.length)];
  const keywords = bahasa === "Indonesia" ? topik.keywordsID : topik.keywordsEN;
  
  try {
    botState.logTerakhir = "🤖 Memproses postingan otomatis untuk bahasa: " + bahasa;
    let urlGambarFinal = topik.imageUrl;

    // 1. Jalur Pembuatan Gambar Kustom Lewat AI Model Pilihan
    if (botState.config.apiKey && botState.config.imageModel) {
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
            prompt: "Cinematic high-tech digital art banner about " + topik.deskripsi + ", 4k resolution, clean sharp style",
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
        console.error("Gagal generate gambar kustom, beralih ke gambar default.", err.message);
      }
    }

    // 2. Jalur Teks Artikel dengan Proteksi Ketat Anti-Halusinasi
    const promptSEO = [
      "Kamu adalah praktisi SEO senior dan blogger teknologi profesional.",
      "Buat artikel tentang: " + topik.deskripsi,
      "Wajib ditulis penuh dalam bahasa: " + bahasa,
      "Gunakan target keyword ini secara natural di dalam paragraf: " + keywords,
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

    const bagianJudul = responsTeks.match(/\[JUDUL\]([\s\S]*?)\[DESKRIPSI\]/);
    const bagianDeskripsi = responsTeks.match(/\[DESKRIPSI\]([\s\S]*?)\[KONTEN\]/);
    const bagianKonten = responsTeks.match(/\[KONTEN\]([\s\S]*)/);

    if (!bagianJudul || !bagianDeskripsi || !bagianKonten) {
      throw new Error("Pola balasan model teks tidak valid.");
    }

    const tigaPetik = String.fromCharCode(96, 96, 96);
    const judulFinal = bagianJudul[1].split(tigaPetik).join("").split("html").join("").trim();
    const deskripsiPenelusuran = bagianDeskripsi[1].trim();
    const kontenHTMLRaw = bagianKonten[1].split(tigaPetik).join("").split("html").join("").trim();

    // Menggabungkan Gambar Sampul dengan CSS Banner Premium
    const bannerHTML = [
      "<div style=\"position: relative; width: 100%; max-width: 800px; margin: 0 auto 30px auto; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.3); font-family: sans-serif;\">",
      "  <img src=\"" + urlGambarFinal + "\" alt=\"" + judulFinal + "\" style=\"width: 100%; height: auto; display: block; max-height: 380px; object-fit: cover; filter: brightness(0.6);\" />",
      "  <div style=\"position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0)); padding: 25px 20px;\">",
      "    <span style=\"background: #3b82f6; color: white; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: bold;\">" + topik.kategori + "</span>",
      "    <h1 style=\"color: white; font-size: 22px; margin: 8px 0 0 0; font-weight: 800;\">" + judulFinal + "</h1>",
      "  </div>",
      "</div><br/>"
    ].join("\n");

    const kontenHTMLFinal = bannerHTML + kontenHTMLRaw;

    // 3. Pengiriman Menggunakan Kredensial Blogger Utama
    const oauth2Client = new google.auth.OAuth2(botState.config.clientId, botState.config.clientSecret, "[https://developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)");
    oauth2Client.setCredentials({ refresh_token: botState.config.refreshToken });
    const blogger = google.blogger({ version: "v3", auth: oauth2Client });

    const response = await blogger.posts.insert({
      blogId: botState.config.blogId,
      requestBody: {
        title: judulFinal,
        content: kontenHTMLFinal,
        labels: [topik.labelBlogger],
        searchDescription: deskripsiPenelusuran
      }
    });

    botState.logTerakhir = "🎉 [SUKSES KONTEN] Berhasil tayang di blog! URL: " + response.data.url;

  } catch (err) {
    botState.logTerakhir = "❌ Kegagalan Siklus Konten: " + err.message;
  }

  botState.indeksJadwal = (botState.indeksJadwal + 1) % jadwalHarian.length;
  botState.nextPostTime = new Date(Date.now() + JEDA_WAKTU).toLocaleString("id-ID") + " WIB";
}

// ==========================================
// ROUTING API CONTROL CENTER & BRANKAS PROFIL
// ==========================================

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
// Dikunci ketat ke 127.0.0.1 agar 100% aman dari peretas jaringan luar atau teman satu Wi-Fi
app.listen(PORT, "127.0.0.1", () => console.log("🚀 Dashboard OS mengudara aman di http://localhost:" + PORT));