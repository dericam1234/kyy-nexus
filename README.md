


# Ympäristön pystytys (Node.js & Vite)

Jos sinulla ei ole Node.js:ää asennettuna, lataa ja asenna se osoitteesta https://nodejs.org.
Avaa terminaali (Komentokehote / Terminal).


## Asenna projekti GitHubista

Kloonaa tai kopioi projekti projekti:
git clone https://github.com/kayttaja/projekti.git

Siirry kansioon:
cd projekti

Asenna riippuvuudet:
npm install


## API-avaimien hankkiminen (TÄRKEÄÄ)
Jotta Document Ingest, AI OSINT ja Yhtiö-kytkökset saavat oikeasti yhteyden tekoälyyn ja Googlen hakutuloksiin, tarvitset Gemini API-avaimen.

1. Mene selaimella osoitteeseen: [aistudio.google.com](https://aistudio.google.com/)
2. Kirjaudu sisään Google-tililläsi.
3. Etsi vasemmasta reunasta tai yläpalkista painike **"Get API key"** (Hanki API-avain).
4. Klikkaa "Create API key" (Luo uusi API-avain uudessa projektissa).
5. Kopioi ruudulle ilmestyvä pitkä salasanarimpsu (esim. `AIzaSy...`) talteen. Tämä on täysin ilmainen käyttää kehitystyössä.

### Koodin yhdistäminen
1. Avaa tiedosto `src/App.jsx` editorissasi
3. Etsi koodin alusta kohta:
   `const apiKey = "";`
4. Liitä Googlelta kopioimasi avain lainausmerkkien sisään:
   `const apiKey = "AIzaSySinunAvainTähän...";`
5. Tallenna tiedosto.

## Käynnistys
Aja terminaalissa komento:
```bash
npm run dev
Selain avaa sivun `localhost:5173`, ja sinulla on nyt omalla koneellasi pyörivä, tekoälyllä ladattu tiedustelualusta!

## Mahdolliset ongelmat

### Node-versio

Tarkista versio:

node -v
Jos versio on alle 20 → päivitä Node.js

### npm ei toimi

npm cache clean --force
npm install

### Portti varattu

npm run dev -- --port=3000

## Vinkit

- Tarkista löytyykö `.env` tai `.env.example`
- Jos löytyy `.env.example`, kopioi se `.env`-tiedostoksi
- Lisää tarvittavat API-avaimet