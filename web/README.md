# AI Gateway Web (Next.js + TypeScript)

Frontend untuk gateway Go di folder induk: chat dengan pilihan AI, dasbor pengguna, dan dasbor admin.

## Fitur

**Chat** (`/chat`)
- Pilih AI: **Otomatis** (prioritas + failover), **Dewan AI** (Custom AI menjawab, AI lain menilai), atau **satu AI tertentu** (tanpa pindah diam-diam ke AI lain).
- **Token premium sendiri**: pilih satu AI, tempel token/API key, lalu pakai. Opsional ganti model.
  Token hanya ada di browser (sessionStorage, atau localStorage bila "Ingat di perangkat ini"), dikirim hanya saat mengirim pesan,
  tidak disimpan di server, tidak dicatat, dan percakapan dengan token sendiri tidak dipakai melatih Custom AI.
- Riwayat obrolan disimpan di browser, Markdown aman (tanpa innerHTML), mobile-friendly, mode gelap otomatis.

**Dasbor pengguna** (`/dashboard`): statistik pemakaian, kelola token premium (uji, hapus), ekspor/hapus riwayat, ganti sandi.

**Dasbor admin** (`/admin`): status provider dan key (tersamar), uji diri dan pemeliharaan Custom AI, kelola pengguna
(peran, nonaktifkan, reset sandi, hapus), antrean tinjau + ajari Custom AI + persona, log tanya-jawab (ekspor JSONL, putar ulang, hapus).

## Keamanan

- `GATEWAY_KEY` hanya di server Next.js; browser tidak pernah melihatnya. Browser hanya bicara ke `/api/*` milik aplikasi ini.
- Sandi di-hash scrypt; sesi cookie `HttpOnly` + `SameSite=Lax` + bertanda tangan HMAC; peran dibaca ulang tiap permintaan
  (menonaktifkan pengguna langsung berlaku). Perlindungan CSRF dengan pemeriksaan `Origin`.
- Batas percobaan login, batas pesan per pengguna, validasi ketat semua input.
- Proxy admin memakai daftar putih rute; role `system` dari pengguna ditolak; ganti model dengan kuota server hanya untuk admin.
- Daftar AI ke pengguna tidak memuat key apa pun.

## Menjalankan

```bash
# 1. jalankan gateway Go (folder induk):  go run ./cmd/server
# 2. frontend
cd web
cp .env.example .env.local     # isi GATEWAY_KEY, SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm run dev                    # http://localhost:3000
```

Login pertama dengan `ADMIN_EMAIL` / `ADMIN_PASSWORD` membuat akun admin. Pengguna lain mendaftar di `/register`
(matikan dengan `ALLOW_SIGNUP=0`, lalu tambahkan lewat dasbor admin).

Catatan gateway: semua permintaan frontend datang dari satu alamat, jadi naikkan `RATE_LIMIT_PER_MIN` di gateway
(misalnya 600), atau set `TRUST_PROXY=1` di gateway dan `FORWARD_CLIENT_IP=1` di frontend agar batas laju per pengguna.

## Deploy (Vercel)

Buat proyek Vercel terpisah dengan **Root Directory = `web`**. Isi semua variabel dari `.env.example`.
Di serverless penyimpanan pengguna **wajib** Upstash Redis (`UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`);
tanpa itu aplikasi menolak jalan agar data tidak hilang diam-diam. `GATEWAY_URL` menunjuk ke gateway Go yang sudah di-deploy.

## Uji

```bash
npm run typecheck
go build -o /tmp/gw ../cmd/server && GW_BIN=/tmp/gw bun test   # uji ujung-ke-ujung lapisan server vs gateway Go sungguhan
```

## Struktur

```
web/
├─ src/lib/            logika server: env, store (file/Upstash), users, session, password, chat, adminproxy, gateway, providers
├─ src/app/api/        route handler: auth, chat, providers, me, admin/users, admin/gw/[...path]
├─ src/app/            halaman: login, register, chat, dashboard, admin/*
├─ src/components/     ChatApp, TokenManager, Markdown, admin panel, vault (token di browser), chatstore
└─ tests/              e2e (Bun) dan parser Markdown
```
