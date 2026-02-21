# Render'a Deploy Etme

Bu proje tek bir Web Service olarak Render'da çalışır: hem API hem React arayüzü aynı URL'den sunulur.

## 1. GitHub'a push

Repoyu GitHub'a yükleyin (henüz yoksa):

```bash
git remote add origin https://github.com/KULLANICI_ADI/REPO_ADI.git
git branch -M main
git push -u origin main
```

## 2. Render'da servis oluşturma

**Blueprint ile (önerilen):**

1. [render.com](https://render.com) → giriş yapın
2. **Dashboard** → **New** → **Blueprint**
3. Repoyu bağlayın (GitHub hesabıyla)
4. Repo seçin; Render `render.yaml` dosyasını bulacak ve servisi oluşturacak
5. **Apply** ile deploy başlatın

**Manuel:**

1. **New** → **Web Service**
2. Repoyu bağlayıp bu repoyu seçin
3. Ayarlar:
   - **Name:** `cilii` (veya istediğiniz isim)
   - **Runtime:** Node
   - **Build Command:** `cd client && npm install && npm run build && cd ../server && npm install`
   - **Start Command:** `cd server && npm start`
   - **Health Check Path:** `/health`
4. **Environment** sekmesinde:
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = güvenli rastgele bir değer (Render "Generate" ile de oluşturabilir)
5. **Create Web Service** ile deploy başlatın

## 3. Deploy sonrası

- Uygulama `https://SERVIS_ADI.onrender.com` adresinde açılır
- Ücretsiz planda servis 15 dakika işlem yoksa uyur; ilk istekte 1–2 dakika uyanır
- **Not:** SQLite kullanıyorsunuz; Render’da disk kalıcı değildir. Her deploy’da veritabanı sıfırlanır. Kalıcı veri için ileride Render Postgres veya harici bir DB kullanabilirsiniz

## 4. Sonraki push'lar

Kod değişikliği yaptıktan sonra:

```bash
git add .
git commit -m "Değişiklik açıklaması"
git push origin main
```

Render, `main` branch’e her push’ta otomatik yeni deploy başlatır (Blueprint’te `autoDeployTrigger` kapatılmadıysa).
