# Render'a Deploy Etme (2 servis)

Bu proje **iki ayrı servis** olarak Render'da çalışır: **API (Node)** + **Frontend (Static)**.

## 1. GitHub'a push

Repoyu GitHub'a yükleyin (henüz yoksa):

```bash
git remote add origin https://github.com/KULLANICI_ADI/REPO_ADI.git
git branch -M main
git push -u origin main
```

## 2. Render'da servis oluşturma (Blueprint)

1. [render.com](https://render.com) → giriş yapın
2. **Dashboard** → **New** → **Blueprint**
3. Repoyu bağlayın (GitHub hesabıyla)
4. Repo seçin; Render `render.yaml` dosyasını okuyup **2 servis** oluşturur:
   - **cilii** – Node (API)
   - **cilii-web** – Static (React frontend)
5. **Apply** ile deploy başlatın

## 3. Environment değişkenleri (önemli)

Deploy bittikten sonra her iki serviste de URL'leri ayarlayın.

### Backend servisi (cilii – Node)

- **Environment** sekmesine girin.
- **CORS_ORIGINS** ekleyin (frontend adresi):
  - Değer: `https://cilii-web.onrender.com`  
  - (Static site adınız farklıysa onu yazın; virgülle birden fazla ekleyebilirsiniz.)

### Frontend servisi (cilii-web – Static)

- **Environment** sekmesine girin.
- **VITE_API_BASE_URL** ekleyin (API adresi):
  - Değer: `https://cilii.onrender.com`  
  - (Backend servis adınız farklıysa onu yazın.)
- Bu değişkeni ekledikten veya değiştirdikten sonra **mutlaka yeniden deploy** alın (Build’i tekrar çalıştırın); aksi halde frontend eski API URL’ini kullanır.

## 4. Deploy sonrası

- **Frontend:** `https://cilii-web.onrender.com` (veya kendi Static site adınız)
- **API:** `https://cilii.onrender.com` (veya kendi Node servis adınız)

Ücretsiz planda servisler ~15 dakika işlem yoksa uyur; ilk istekte 1–2 dakika uyanır.

**Not:** SQLite kullanıyorsanız Render’da disk kalıcı değildir; her deploy’da veritabanı sıfırlanabilir. Kalıcı veri için Render Postgres veya harici bir DB kullanabilirsiniz.

## 5. Sonraki push'lar

```bash
git add .
git commit -m "Değişiklik açıklaması"
git push origin main
```

Render, `main` branch’e her push’ta her iki servisi de otomatik yeniden deploy eder (Blueprint ayarlarında kapatılmadıysa).
