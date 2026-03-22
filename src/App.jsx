import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Network, Database, Search, User, Building, MapPin, Shield, Activity, 
  ChevronRight, Maximize, Crosshair, Plus, Trash2, ZoomIn, ZoomOut, 
  RefreshCw, Globe, AlertTriangle, Save, Sparkles, ExternalLink,
  Map as MapIcon, Clock, Bell, FileText, CheckCircle2, X,
  Image as ImageIcon, Download, Upload 
} from 'lucide-react';

/**
 * KYY NEXUS INTELLIGENCE PLATFORM - GOTHAM EDITION
 * -------------------------------------------
 * Täysimittainen tiedustelu- ja analyysialusta.
 * - Graafipohjainen verkostoanalyysi (Semantic Zoom)
 * - Geospatiaalinen Web Mercator -karttamoottori (OSM)
 * - Gemini 3 Preview AI -integraatio (NLP & OSINT)
 * - Ontologiapohjainen tiedonhallinta
 */

// --- APUFUNKTIOT JA VAKIOIDEN MÄÄRITTELY ---
const generateId = () => Math.random().toString(36).substr(2, 9);

// API-asetukset
const apiKey = "AIzaSyAZ5mawe0picS8FEkUawxK-w83JLD6nKS8"; 
const MODEL_NAME = "gemini-3-flash-preview";

const getNodeIcon = (type) => {
  switch (type) {
    case 'person': return <User size={16} />;
    case 'org': return <Building size={16} />;
    case 'location': return <MapPin size={16} />;
    case 'event': return <Shield size={16} />;
    default: return <Activity size={16} />;
  }
};

const getNodeColor = (type) => {
  switch (type) {
    case 'person': return 'fill-blue-500 stroke-blue-300';
    case 'org': return 'fill-purple-500 stroke-purple-300';
    case 'location': return 'fill-emerald-500 stroke-emerald-300';
    case 'event': return 'fill-amber-500 stroke-amber-300';
    default: return 'fill-slate-500 stroke-slate-300';
  }
};

const getRiskColor = (risk) => {
  switch (risk) {
    case 'high': return 'text-red-400';
    case 'medium': return 'text-amber-400';
    case 'low': return 'text-emerald-400';
    default: return 'text-slate-400';
  }
};

// API-kutsujen retry-logiikka. Eksponentiaalinen viive.
const fetchWithBackoff = async (url, options, retries = 4, delay = 1500) => {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      throw new Error(`HTTP-virhe! Status: ${res.status}`);
    }
    return res;
  } catch (error) {
    if (retries > 0) {
      console.warn(`API-raja tai verkkovirhe. Odotetaan ${delay}ms ja yritetään uudelleen...`);
      await new Promise(r => setTimeout(r, delay));
      return fetchWithBackoff(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
};

// --- VERKKOHAKU (WEB SCRAPING) VAHVISTETULLA LOGIIKALLA ---
// Haetaan hakutulokset ensin erikseen avoimen proxyn kautta välttäen evästemuurit, minkä jälkeen AI analysoi pelkän tekstin.
const fetchWebData = async (query) => {
  try {
    // Käytetään useampaa hakukonetta varmuuden vuoksi. Yahoo on usein sallivampi proxy-hauille kuin DuckDuckGo.
    const engines = [
      { url: `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, selector: '.compText' },
      { url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, selector: '.result__snippet' }
    ];

    let html = '';
    let usedSelector = '';

    for (const engine of engines) {
      // Aikaleima (Date.now()) estää palvelimia palauttamasta välimuistissa olevaa vanhaa virhesivua
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(engine.url)}&t=${Date.now()}`;
      try {
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const data = await response.json();
          html = data.contents;
          
          // ROBUSTI SUODATIN: Varmistetaan ettei proxy palauttanut DDoS-suojauksen "Bot Check" -sivua
          const isBlocked = html.includes('Bot Check') || 
                            html.includes('d4cd0dab') || 
                            html.includes('Cloudflare') ||
                            html.length < 500;
                            
          if (!isBlocked) {
            usedSelector = engine.selector;
            break; // Toimiva HTML-sivu saatiin, lopetetaan yrittäminen
          } else {
            console.warn("Palomuuri havaittu, yritetään seuraavaa hakukonetta...");
            html = ''; // Nollataan
          }
        }
      } catch (e) {
        console.warn(`Proxy-yhteys epäonnistui.`);
      }
    }

    if (!html) {
       return "VERKKOHAKU EPÄONNISTUI: Kohdetta ei voitu hakea, koska hakukoneiden bottisuojaus esti pyynnöt tilapäisesti. Kokeile myöhemmin uudelleen.";
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    let text = Array.from(doc.querySelectorAll(usedSelector)).map(el => el.textContent.trim()).join('\n');
    
    // Jos osumia ei löytynyt, otetaan talteen body-teksti siivottuna varasuunnitelmana
    if (!text || text.length < 50) {
       text = doc.body?.textContent?.replace(/\s+/g, ' ').substring(0, 5000);
    }
    
    return text || "Ei merkittäviä hakutuloksia.";
  } catch (e) {
    console.error("Web-haun virhe:", e);
    return "Hakutulosten nouto epäonnistui proxy-virheen vuoksi.";
  }
};

// Älykäs Gemini API -kääre (EI KÄYTETÄ GEMININ OMAA GOOGLE-TYÖKALUA, VAIN TEKSTIANALYYSIÄ)
const callGemini = async (prompt, jsonMode = false) => {
  const payload = { contents: [{ parts: [{ text: prompt }] }] };
  if (jsonMode) payload.generationConfig = { responseMimeType: "application/json" };
  
  const response = await fetchWithBackoff(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.candidates) throw new Error("API palautti tyhjän vastauksen.");
  return data.candidates[0].content.parts[0].text;
};

// --- GEOSPATIAALINEN MATEMATIIKKA (Web Mercator -projektio) ---
const getMapX = (lng) => ((lng + 180) / 360) * 256;
const getMapY = (lat) => {
  const latRad = lat * Math.PI / 180;
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 256;
};

const reverseMapXToLng = (x) => (x / 256) * 360 - 180;
const reverseMapYToLat = (y) => {
  const n = Math.PI - (2 * Math.PI * y) / 256;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

const getOntologyProperties = (type) => {
  switch (type) {
    case 'person': return { 'kansalaisuus': '', 'henkilötunnus': '', 'aliakset': '' };
    case 'org': return { 'y-tunnus': '', 'toimiala': '', 'perustettu': '' };
    case 'location': return { 'osoite': '', 'turvataso': '', 'koordinaatit': '' };
    case 'event': return { 'päivämäärä': '', 'tila': '', 'vakavuus': '' };
    default: return {};
  }
};

// --- ALKUDATA (Esimerkkikohteet Porissa) ---
const defaultNodes = [
  { 
    id: '1', label: 'Matti Virtanen', type: 'person', 
    x: 400, y: 300, lat: 61.4978, lng: 21.7972, date: '2023-10-15',
    info: 'Kohdehenkilö. Epäilty kytköksistä varjotalouteen.', risk: 'high',
    properties: { 'kansalaisuus': 'Suomi', 'henkilötunnus': '151080-XXXX', 'aliakset': 'MaZa' }
  },
  { 
    id: '2', label: 'Logistiikkakeskus A', type: 'location', 
    x: 200, y: 400, lat: 61.4851, lng: 21.7974, date: '2023-10-12',
    info: 'Keskeinen solmupiste tavaravirroissa.', risk: 'medium',
    properties: { 'osoite': 'Yrjönkatu 1', 'turvataso': 'Rajoitettu', 'koordinaatit': '61.4851, 21.7974' }
  }
];

const defaultEdges = [
  { source: '1', target: '2', label: 'Vieraillut kohteessa', date: '2023-10-14' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('graph');
  
  // Sovelluksen tila (ladataan tallennuksesta)
  const [nodes, setNodes] = useState(() => JSON.parse(localStorage.getItem('nexus_nodes_v7')) || defaultNodes);
  const [edges, setEdges] = useState(() => JSON.parse(localStorage.getItem('nexus_edges_v7')) || defaultEdges);
  const [mapBackground, setMapBackground] = useState(() => localStorage.getItem('nexus_map_bg_v7') || null);
  const [showRealMap, setShowRealMap] = useState(() => JSON.parse(localStorage.getItem('nexus_realmap_v7')) || false);
  
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [customKeywords, setCustomKeywords] = useState(''); // Omat hakusanat
  
  // Kameroiden hallinta
  const [cameras, setCameras] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    const initMapZoom = 35000;
    return {
      graph: { x: 0, y: 0, zoom: 1 },
      map: { x: w / 2 - getMapX(21.7972) * initMapZoom, y: h / 2 - getMapY(61.4978) * initMapZoom, zoom: initMapZoom }
    };
  });
  
  const camera = activeTab === 'map' ? cameras.map : cameras.graph;
  
  const updateCamera = (updater) => {
    setCameras(prev => {
      const tab = activeTab === 'map' ? 'map' : 'graph';
      const newCam = typeof updater === 'function' ? updater(prev[tab]) : updater;
      return { ...prev, [tab]: newCam };
    });
  };

  const [isPanning, setIsPanning] = useState(false);
  const [draggingNode, setDraggingNode] = useState(null);
  const [isDragged, setIsDragged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  
  const [isNlpModalOpen, setIsNlpModalOpen] = useState(false);
  const [nlpInputText, setNlpInputText] = useState('');

  const svgRef = useRef(null);

  // Synkronointi LocalStorageen ja automaattiset järjestelmähälytykset
  useEffect(() => {
    localStorage.setItem('nexus_nodes_v7', JSON.stringify(nodes));
    localStorage.setItem('nexus_edges_v7', JSON.stringify(edges));
    localStorage.setItem('nexus_realmap_v7', JSON.stringify(showRealMap));
    if (mapBackground) { try { localStorage.setItem('nexus_map_bg_v7', mapBackground); } catch(e) {} }

    // Älykäs analyysi: havaitse riskialttiit kytkökset
    const newAlerts = [];
    edges.forEach(edge => {
      const s = nodes.find(n => n.id === edge.source);
      const t = nodes.find(n => n.id === edge.target);
      if (s && t && s.risk === 'high' && ['location', 'event'].includes(t.type)) {
        newAlerts.push({ 
          id: `${s.id}-${t.id}`, 
          level: 'critical', 
          message: `VAROITUS: Korkean riskin entiteetti ${s.label} kytkeytyy kohteeseen ${t.label}.` 
        });
      }
    });
    if (JSON.stringify(alerts.map(a=>a.id)) !== JSON.stringify(newAlerts.map(a=>a.id))) setAlerts(newAlerts);
  }, [nodes, edges, mapBackground, showRealMap]);

  // Dynaaminen OpenStreetMap-tiilien lataus
  const getVisibleTiles = () => {
    if (activeTab !== 'map' || !showRealMap) return [];
    const z = Math.max(0, Math.min(19, Math.floor(Math.log2(camera.zoom))));
    const numTiles = Math.pow(2, z);
    const tileSizeWorld = 256 / numTiles;
    
    const w = window.innerWidth;
    const h = window.innerHeight;
    const minWX = -camera.x / camera.zoom;
    const minWY = -camera.y / camera.zoom;
    const maxWX = (w - camera.x) / camera.zoom;
    const maxWY = (h - camera.y) / camera.zoom;
    
    const minTx = Math.max(0, Math.floor(minWX / tileSizeWorld));
    const minTy = Math.max(0, Math.floor(minWY / tileSizeWorld));
    const maxTx = Math.min(numTiles - 1, Math.floor(maxWX / tileSizeWorld));
    const maxTy = Math.min(numTiles - 1, Math.floor(maxWY / tileSizeWorld));
    
    const tiles = [];
    let count = 0;
    for (let x = minTx; x <= maxTx; x++) {
      for (let y = minTy; y <= maxTy; y++) {
        if (count++ < 250) tiles.push({ x, y, z });
      }
    }
    return tiles;
  };

  // --- NÄKYMÄN HALLINTA (ZOOM & PAN) ---
  const performZoom = (zoomFactor, centerX, centerY) => {
    updateCamera(prev => {
      let newZoom = prev.zoom * zoomFactor;
      const maxZ = activeTab === 'map' ? 10000000 : 500;
      const minZ = activeTab === 'map' ? 50 : 0.05;
      newZoom = Math.max(minZ, Math.min(newZoom, maxZ));
      const wX = (centerX - prev.x) / prev.zoom;
      const wY = (centerY - prev.y) / prev.zoom;
      return { x: centerX - wX * newZoom, y: centerY - wY * newZoom, zoom: newZoom };
    });
  };

  const handleWheel = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    performZoom(1 + (-e.deltaY * 0.001), e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleMouseDownNode = (e, id) => { e.stopPropagation(); setDraggingNode(id); setIsDragged(false); };
  const handleMouseDownCanvas = () => setIsPanning(true);
  const handleMouseMove = useCallback((e) => {
    if (draggingNode && activeTab === 'graph') {
      setIsDragged(true);
      setNodes(prev => prev.map(n => n.id === draggingNode ? { ...n, x: n.x + e.movementX/camera.zoom, y: n.y + e.movementY/camera.zoom } : n));
    } else if (isPanning) {
      updateCamera(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }));
    }
  }, [draggingNode, isPanning, camera.zoom, activeTab]);

  const handleMouseUp = () => { setDraggingNode(null); setIsPanning(false); setTimeout(() => setIsDragged(false), 50); };
  const handleNodeClick = (e, id) => { e.stopPropagation(); if (!isDragged) setSelectedNodeId(prev => prev === id ? null : id); };
  const handleBackgroundClick = () => { if (!isDragged && !isPanning) setSelectedNodeId(null); };

  // --- NÄKYMÄN KESKITYS (FIT TO SCREEN) ---
  const handleFitToScreen = () => {
    if (nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    nodes.forEach(n => {
      const nx = activeTab === 'map' ? getMapX(n.lng) : n.x;
      const ny = activeTab === 'map' ? getMapY(n.lat) : n.y;
      if (nx < minX) minX = nx;
      if (nx > maxX) maxX = nx;
      if (ny < minY) minY = ny;
      if (ny > maxY) maxY = ny;
    });

    if (minX === maxX) { minX -= 100; maxX += 100; }
    if (minY === maxY) { minY -= 100; maxY += 100; }

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const availableWidth = window.innerWidth - 300; 
    const availableHeight = window.innerHeight - 100;
    
    let zoomX = availableWidth / (maxX - minX);
    let zoomY = availableHeight / (maxY - minY);
    let newZoom = Math.min(zoomX, zoomY) * 0.9; 

    const maxZ = activeTab === 'map' ? 1000000 : 2;
    const minZ = activeTab === 'map' ? 1000 : 0.1;
    newZoom = Math.max(minZ, Math.min(newZoom, maxZ));

    const newCamX = (window.innerWidth / 2) - (centerX * newZoom);
    const newCamY = (window.innerHeight / 2) - (centerY * newZoom);

    updateCamera({ x: newCamX, y: newCamY, zoom: newZoom });
  };

  // --- ENTITEETTIEN HALLINTA ---
  const addNewNode = () => {
    const wX = (-camera.x + window.innerWidth / 2) / camera.zoom;
    const wY = (-camera.y + window.innerHeight / 2) / camera.zoom;
    const node = {
      id: generateId(), label: 'Uusi Kohde', type: 'person',
      x: wX, y: wY, 
      lat: activeTab === 'map' ? reverseMapYToLat(wY) : 61.4, 
      lng: activeTab === 'map' ? reverseMapXToLng(wX) : 21.8,
      date: new Date().toISOString().split('T')[0], info: 'Lisätty manuaalisesti kankaalle.', risk: 'low',
      properties: getOntologyProperties('person')
    };
    setNodes([...nodes, node]);
    setSelectedNodeId(node.id);
  };

  const deleteNode = (id) => {
    setNodes(nodes.filter(n => n.id !== id));
    setEdges(edges.filter(e => e.source !== id && e.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const clearSession = () => {
    if (window.confirm("Haluatko varmasti tyhjentää koko session?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const exportSession = () => {
    const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ nodes, edges, showRealMap }));
    const link = document.createElement('a');
    link.setAttribute("href", data);
    link.setAttribute("download", `nexus_export_${new Date().getTime()}.json`);
    link.click();
  };

  const importSession = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const s = JSON.parse(ev.target.result);
        if (s.nodes) setNodes(s.nodes);
        if (s.edges) setEdges(s.edges);
        alert("Sessio ladattu.");
      } catch(e) { alert("Tiedosto on virheellinen."); }
    };
    reader.readAsText(file);
  };

  // --- TEKOÄLY-INTEGRAATIOT ---
  
  const ingestDocument = async () => {
    if (!nlpInputText.trim()) return;
    setIsNlpModalOpen(false);
    setLoadingText('Nexus AI analysoi dokumenttia ja rakentaa verkkoa...');
    setIsLoading(true);

    try {
      const prompt = `Analysoi teksti ja poimi tärkeimmät entiteetit ja niiden väliset suhteet. Palauta VASTAUS PELKKÄNÄ JSONINA ilman markdown-tageja. Käytä tätä tiukkaa rakennetta: {"nodes": [{"id": "n1", "label": "Nimi", "type": "person/org/location", "info": "Kuvaus", "lat": 61.4, "lng": 21.7, "risk": "low/medium/high"}], "edges": [{"source": "n1", "target": "n2", "label": "Tähän selkeä lyhyt suhde, esim. 'Omistaja'"}]}. Teksti: ${nlpInputText}`;
      
      const rawText = await callGemini(prompt, true); 
      const jsonMatch = rawText.match(/\{[\s\S]*"nodes"[\s\S]*"edges"[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Ei JSON-verkkoa.");
      
      const graph = JSON.parse(jsonMatch[0]);
      
      const idMap = {};
      const newNodes = (graph.nodes || []).map(ent => {
        const newId = generateId();
        idMap[ent.id] = newId;
        return {
          id: newId, label: ent.label, type: ent.type || 'person',
          x: (-camera.x + 500) / camera.zoom + (Math.random()*300-150),
          y: (-camera.y + 400) / camera.zoom + (Math.random()*300-150),
          lat: ent.lat || 61.4, lng: ent.lng || 21.7, date: new Date().toISOString().split('T')[0],
          info: ent.info, risk: ent.risk || 'medium', properties: getOntologyProperties(ent.type || 'person')
        };
      });

      const newEdges = (graph.edges || []).map(edge => ({
        source: idMap[edge.source] || edge.source,
        target: idMap[edge.target] || edge.target,
        label: edge.label || 'Yhteys havaittu',
        date: new Date().toISOString().split('T')[0]
      }));

      if (selectedNodeId && newNodes.length > 0) {
        newEdges.push({ source: selectedNodeId, target: newNodes[0].id, label: 'Mainittu dokumentissa', date: new Date().toISOString().split('T')[0] });
      }

      setNodes(prev => [...prev, ...newNodes]);
      setEdges(prev => [...prev, ...newEdges]);
      setNlpInputText('');
    } catch (e) { 
      console.error("NLP Virhe:", e); 
      alert("Tekoälyanalyysi epäonnistui. Tarkista syötetty teksti."); 
    }
    finally { setIsLoading(false); }
  };

  const transformAIOsint = async (node) => {
    if (!apiKey) { alert("API-avain puuttuu."); return; }
    setLoadingText(`Kerätään hakutietoja verkosta kohteelle: ${node.label}...`);
    setIsLoading(true);
    try {
      const query = `"${node.label}" ${customKeywords ? customKeywords : 'uutiset OR tiedotteet'}`.trim();
      const searchResults = await fetchWebData(query);
      
      const prompt = `Tee tiivistetty tiedusteluanalyysi (max 5 lausetta) kohteesta: ${node.label} (${node.type}). Käytä analyysissä VAIN näitä hakutuloksia:\n\n${searchResults}\n\nJos hakutuloksia on vähän, tee paras arviosi olemassa olevan tiedon pohjalta.`;
      
      const report = await callGemini(prompt, false); 
      
      setNodes(prev => prev.map(n => n.id === node.id ? { 
        ...n, 
        info: n.info ? `${n.info}\n\n--- AI OSINT (${new Date().toLocaleDateString()}) ---\n${report}` : report 
      } : n));
    } catch (e) { 
      console.error("OSINT-virhe:", e); 
      alert("OSINT-analyysi epäonnistui. Palvelin saattaa olla ruuhkautunut."); 
    }
    finally { setIsLoading(false); }
  };

  const transformWikipedia = async (node) => {
    setLoadingText(`Haetaan Wikipedia-profiilia: ${node.label}...`);
    setIsLoading(true);
    try {
      const res = await fetch(`https://fi.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(node.label)}`);
      if (res.ok) {
        const data = await res.json();
        setNodes(prev => prev.map(n => n.id === node.id ? { 
          ...n, 
          info: n.info ? `${n.info}\n\n--- WIKIPEDIA ---\n${data.extract}` : data.extract 
        } : n));
      } else { alert("Ei Wikipedia-artikkelia löytynyt."); }
    } catch (e) { alert("Yhteysvirhe Wikipediaan."); }
    finally { setIsLoading(false); }
  };

  const transformFindConnections = async (node) => {
    if (!apiKey) { alert("API-avain puuttuu."); return; }
    setLoadingText(`Etsitään kytköksiä verkosta: ${node.label}...`);
    setIsLoading(true);
    try {
      const query = `"${node.label}" ${customKeywords ? customKeywords : 'kytkökset OR verkosto OR uutiset'}`.trim();
      const searchResults = await fetchWebData(query);

      const prompt = `Olet tiedusteluanalyytikko. Etsi seuraavista hakutuloksista KAIKKI henkilöt, yritykset ja organisaatiot, jotka mainitaan kohteen "${node.label}" yhteydessä. 
      Voit myös käyttää omaa yleistietoasi täydentämään kytköksiä, jos olet niistä varma.
      
      Palauta VASTAUS PELKKÄNÄ JSON-LISTANA. Formatti: [{"name": "Matti Meikäläinen", "role": "Liikekumppani", "type": "person", "info": "Mainittiin samassa uutisessa"}]. 
      Yritä löytää vähintään 1-3 kytköstä. Älä kirjoita muuta tekstiä kuin puhdas JSON-taulukko.
      
      Hakutulokset:
      ${searchResults}`;
      
      const rawText = await callGemini(prompt, false); 
      
      let cleanText = rawText.replace(/```json|```/gi, "").trim();
      const startIndex = cleanText.indexOf('[');
      const endIndex = cleanText.lastIndexOf(']');
      
      if (startIndex === -1 || endIndex === -1) {
          alert("Tekoäly ei löytänyt tarpeeksi selkeitä kytköksiä. Kokeile antaa lisähakusanoja.");
          return;
      }
      
      cleanText = cleanText.substring(startIndex, endIndex + 1);
      const results = JSON.parse(cleanText);
      
      if (results.length === 0) {
          alert("Ei kytköksiä löydetty. Kokeile antaa lisähakusanoja.");
          return;
      }
      
      const newNodes = [];
      const newEdges = [];
      
      results.forEach((res, index) => {
        const id = generateId();
        const angle = (index / results.length) * Math.PI * 2;
        const radius = 180 + Math.random() * 50;
        
        newNodes.push({
          id, label: res.name, type: res.type || 'org',
          x: node.x + Math.cos(angle) * radius, 
          y: node.y + Math.sin(angle) * radius,
          lat: node.lat + (Math.random()*0.02 - 0.01), 
          lng: node.lng + (Math.random()*0.02 - 0.01), 
          date: new Date().toISOString().split('T')[0],
          info: res.info || `Löydetty AI-kytkös.`, risk: 'low',
          properties: getOntologyProperties(res.type || 'org')
        });
        
        newEdges.push({ 
          source: node.id, 
          target: id, 
          label: res.role || 'Kytkös löydetty', 
          date: new Date().toISOString().split('T')[0] 
        });
      });
      
      setNodes(prev => [...prev, ...newNodes]);
      setEdges(prev => [...prev, ...newEdges]);
    } catch(e) { 
      console.error("Kytkösten haku epäonnistui:", e);
      alert("Kytkösten haussa tapahtui virhe. Tekoäly ei voinut muodostaa verkostoa."); 
    }
    finally { setIsLoading(false); }
  };

  const centerOnMap = (node) => {
    if (!node) return;
    setActiveTab('map');
    setCameras(prev => {
      const targetZoom = Math.max(prev.map.zoom, 50000); 
      const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const h = typeof window !== 'undefined' ? window.innerHeight : 800;
      const offsetX = (w - 340) / 2; 
      const offsetY = h / 2;
      return {
        ...prev,
        map: {
          x: offsetX - getMapX(node.lng) * targetZoom,
          y: offsetY - getMapY(node.lat) * targetZoom,
          zoom: targetZoom
        }
      };
    });
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const filteredNodes = nodes.filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex h-screen w-full bg-[#0B1120] text-slate-300 font-sans overflow-hidden select-none text-[13px]">
      
      {/* --- VASEMPI NAVIGAATIOPALKKI --- */}
      <div className="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 space-y-6 z-30 shadow-2xl">
        <button 
          onClick={handleFitToScreen}
          className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 hover:scale-105 active:scale-95 transition-all"
          title="Keskitä näkymä (Fit to Screen)"
        >
          <Crosshair className="text-white" size={20} />
        </button>
        <div className="flex flex-col space-y-2 w-full">
          <button onClick={() => setActiveTab('graph')} className={`w-full py-4 flex justify-center transition-all ${activeTab === 'graph' ? 'text-indigo-400 border-r-2 border-indigo-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`} title="Verkkoanalyysi"><Network size={20} /></button>
          <button onClick={() => setActiveTab('map')} className={`w-full py-4 flex justify-center transition-all ${activeTab === 'map' ? 'text-indigo-400 border-r-2 border-indigo-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`} title="Spatiaalinen analyysi"><MapIcon size={20} /></button>
          <button onClick={() => setActiveTab('timeline')} className={`w-full py-4 flex justify-center transition-all ${activeTab === 'timeline' ? 'text-indigo-400 border-r-2 border-indigo-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`} title="Aikajana"><Clock size={20} /></button>
          <button onClick={() => setActiveTab('database')} className={`w-full py-4 flex justify-center transition-all ${activeTab === 'database' ? 'text-indigo-400 border-r-2 border-indigo-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`} title="Tietokanta"><Database size={20} /></button>
        </div>
        <div className="mt-auto pt-6 flex flex-col space-y-2 w-full border-t border-slate-800">
          <button onClick={() => setIsNlpModalOpen(true)} className="w-full py-3 flex justify-center text-indigo-300 hover:text-indigo-100 bg-indigo-900/10 transition-colors" title="NLP Dokumenttianalyysi"><FileText size={18} /></button>
          <button onClick={addNewNode} className="w-full py-3 flex justify-center text-emerald-400 hover:text-emerald-300 bg-emerald-900/10 transition-colors" title="Lisää entiteetti"><Plus size={20} /></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full relative">
        {/* --- YLÄPALKKI --- */}
        <div className="h-14 bg-slate-900/95 backdrop-blur border-b border-slate-800 flex items-center justify-between px-6 z-30 shadow-sm">
          <div className="flex items-center space-x-6">
            <h1 className="text-xs font-black tracking-[0.4em] text-slate-100 uppercase">Kyy Nexus</h1>
            <div className="flex items-center space-x-3 border-l border-slate-700 pl-6 text-slate-400">
                <button onClick={() => performZoom(1.5, window.innerWidth/2, window.innerHeight/2)} className="hover:text-white p-1" title="Lähennä"><ZoomIn size={16}/></button>
                <button onClick={() => performZoom(1/1.5, window.innerWidth/2, window.innerHeight/2)} className="hover:text-white p-1" title="Loitonna"><ZoomOut size={16}/></button>
                <div className="w-px h-4 bg-slate-800 mx-2"></div>
                <button onClick={clearSession} className="hover:text-red-400 p-1" title="Tyhjennä sessio"><Trash2 size={16}/></button>
                <button onClick={exportSession} className="hover:text-indigo-400 p-1" title="Lataa sessio"><Download size={16}/></button>
                <label className="cursor-pointer hover:text-emerald-400 p-1" title="Tuo sessio"><Upload size={16}/><input type="file" className="hidden" onChange={importSession} /></label>
            </div>
          </div>
          <div className="flex items-center space-x-4">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input type="text" placeholder="Suodata näkymää..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-full pl-9 pr-4 py-1.5 text-xs w-72 focus:outline-none focus:border-indigo-500 shadow-inner" />
             </div>
             <button onClick={() => setShowAlerts(!showAlerts)} className={`p-2 rounded-full relative transition-colors ${alerts.length > 0 ? 'bg-red-900/20 text-red-400' : 'text-slate-500 hover:bg-slate-800'}`}>
                <Bell size={18}/>
                {alerts.length > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-slate-900"></span>}
             </button>
          </div>
        </div>

        {/* --- PÄÄKANGAS (SVG-ANALYYSI) --- */}
        <div className="flex-1 relative overflow-hidden bg-[#0a0f18]">
          {(activeTab === 'graph' || activeTab === 'map') && (
            <>
              {/* Karttatilan spesifit kontrollit */}
              {activeTab === 'map' && (
                 <div className="absolute bottom-6 left-6 z-20 flex flex-col space-y-2">
                    <button onClick={() => setShowRealMap(!showRealMap)} className={`px-4 py-2.5 rounded-lg text-[10px] font-black tracking-widest border transition-all shadow-xl backdrop-blur-md ${showRealMap ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_20px_rgba(79,70,229,0.3)]' : 'bg-slate-800/90 text-slate-300 border-slate-700'}`}>
                      KARTTAKUVAT: {showRealMap ? 'PÄÄLLÄ' : 'POIS'}
                    </button>
                    <label className="px-4 py-2 bg-slate-800/90 border border-slate-700 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-slate-700 shadow-lg backdrop-blur-md transition-colors"><ImageIcon size={14} className="inline mr-2" /> LATAA OMA TAUSTA<input type="file" className="hidden" onChange={(e) => {const f=e.target.files[0]; if(f){const r=new FileReader(); r.onload=(ev)=>setMapBackground(ev.target.result); r.readAsDataURL(f);}}} /></label>
                 </div>
              )}
              
              <svg 
                ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing"
                onWheel={handleWheel} onMouseDown={handleMouseDownCanvas} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onClick={handleBackgroundClick}
              >
                {/* Taustaruudukko (Tutka) */}
                {activeTab === 'map' && !showRealMap && (
                   <rect width="100%" height="100%" fill="url(#radarGrid)" />
                )}
                <defs>
                   <pattern id="radarGrid" width="100" height="100" patternUnits="userSpaceOnUse" patternTransform={`translate(${camera.x % 100}, ${camera.y % 100})`}>
                      <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#10b981" strokeWidth="0.5" opacity="0.1"/>
                   </pattern>
                </defs>

                <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
                  
                  {/* OPENSTREETMAP TILET */}
                  {activeTab === 'map' && showRealMap && (
                    <g className="filter invert hue-rotate-180 brightness-75 contrast-125 opacity-60">
                      {getVisibleTiles().map(t => {
                        const size = 256/Math.pow(2,t.z);
                        const visualOverlap = 0.5 / camera.zoom; 
                        return <image key={`${t.z}-${t.x}-${t.y}`} href={`https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`} x={t.x*size} y={t.y*size} width={size+visualOverlap} height={size+visualOverlap} preserveAspectRatio="none" />;
                      })}
                    </g>
                  )}

                  {/* CUSTOM TAUSTAKUVA */}
                  {activeTab === 'map' && mapBackground && !showRealMap && (
                    <image href={mapBackground} x="0" y="0" width="256" height="256" opacity="0.4" />
                  )}

                  {/* GRAAFIELEMENTIT */}
                  {(() => {
                    const inv = camera.zoom > 1 ? 1/camera.zoom : 1;
                    return (
                      <>
                        {/* Viivat (Yhteydet) - TEKSTIT AINA NÄKYVISSÄ */}
                        {edges.map((edge, i) => {
                          const s = nodes.find(n => n.id === edge.source);
                          const t = nodes.find(n => n.id === edge.target);
                          if (!s || !t) return null;
                          const sx = activeTab === 'map' ? getMapX(s.lng) : s.x;
                          const sy = activeTab === 'map' ? getMapY(s.lat) : s.y;
                          const tx = activeTab === 'map' ? getMapX(t.lng) : t.x;
                          const ty = activeTab === 'map' ? getMapY(t.lat) : t.y;
                          const isSel = selectedNodeId === s.id || selectedNodeId === t.id;
                          return (
                            <g key={i}>
                                <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={isSel ? '#818cf8' : '#334155'} strokeWidth={(isSel ? 3 : 1.5)/camera.zoom} opacity={isSel ? "1" : "0.5"} />
                                {/* Kytkös-tekstit */}
                                <g transform={`translate(${(sx+tx)/2}, ${(sy+ty)/2}) scale(${inv})`}>
                                  <text 
                                    x="0" 
                                    y="0" 
                                    textAnchor="middle" 
                                    className={`${isSel ? 'fill-indigo-300 font-bold text-[10px]' : 'fill-slate-500 font-medium text-[8px]'} tracking-tight drop-shadow-md`}
                                    style={{ textShadow: '0px 2px 4px rgba(0,0,0,0.8)' }}
                                  >
                                    {edge.label}
                                  </text>
                                </g>
                            </g>
                          );
                        })}

                        {/* Solmut (Entiteetit) */}
                        {nodes.map(n => {
                          const px = activeTab === 'map' ? getMapX(n.lng) : n.x;
                          const py = activeTab === 'map' ? getMapY(n.lat) : n.y;
                          const isS = selectedNodeId === n.id;
                          if (searchQuery && !n.label.toLowerCase().includes(searchQuery.toLowerCase())) return null;
                          
                          return (
                            <g key={n.id} transform={`translate(${px}, ${py}) scale(${inv})`} onMouseDown={(e) => handleMouseDownNode(e, n.id)} onClick={(e) => handleNodeClick(e, n.id)} className="cursor-pointer group">
                              {isS && <circle r="36" className="fill-transparent stroke-2 stroke-indigo-400 stroke-dasharray-[4,4] animate-pulse" />}
                              <circle r="22" className={`${getNodeColor(n.type)} stroke-[3px] shadow-2xl transition-all group-hover:brightness-125`} />
                              <text y="6" textAnchor="middle" className="fill-white font-black text-sm pointer-events-none uppercase">{n.type[0]}</text>
                              <rect x="-50" y="32" width="100" height="18" rx="4" fill="#0f172a" opacity="0.85" className="stroke-slate-700" strokeWidth="0.5" />
                              <text y="44" textAnchor="middle" className={`text-[10px] font-black tracking-tight pointer-events-none ${isS ? 'fill-white underline' : 'fill-slate-300'}`}>{n.label}</text>
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </g>
              </svg>
            </>
          )}

          {/* --- OIKEA SIVUPALKKI (TIEDUSTELU JA HAUT) --- */}
          {(activeTab === 'graph' || activeTab === 'map') && selectedNode && (
            <div className="absolute right-0 top-0 bottom-0 w-85 bg-slate-900 border-l border-slate-800 z-40 overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300">
                <div className="p-6 border-b border-slate-800 sticky top-0 bg-slate-900/90 backdrop-blur-md z-10">
                    <div className="flex justify-between mb-4 items-center">
                        <div className="text-[10px] uppercase font-black text-indigo-400 tracking-[0.2em] bg-indigo-500/10 px-2 py-0.5 rounded flex items-center">
                            <Database size={10} className="mr-1"/> 
                            <select 
                                value={selectedNode.type} 
                                onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, type: e.target.value, properties: getOntologyProperties(e.target.value) } : n))}
                                className="bg-transparent focus:outline-none cursor-pointer appearance-none text-indigo-400"
                            >
                                <option value="person" className="bg-slate-900">PERSON</option>
                                <option value="org" className="bg-slate-900">ORG</option>
                                <option value="location" className="bg-slate-900">LOCATION</option>
                                <option value="event" className="bg-slate-900">EVENT</option>
                            </select>
                        </div>
                        <button onClick={() => deleteNode(selectedNodeId)} className="text-slate-500 hover:text-red-400 transition-colors p-1"><Trash2 size={16}/></button>
                    </div>
                    <input type="text" value={selectedNode.label} onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? {...n, label: e.target.value} : n))} className="bg-transparent text-2xl font-bold w-full text-white focus:outline-none border-b border-transparent focus:border-indigo-500 transition-all pb-1" />
                </div>
                <div className="p-6 space-y-8 pb-24">
                    <div>
                        <h4 className="text-[10px] uppercase font-black text-slate-500 mb-3 tracking-widest flex items-center"><FileText size={12} className="mr-2"/> Tiedusteluraportti</h4>
                        <textarea value={selectedNode.info} onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? {...n, info: e.target.value} : n))} className="bg-slate-950 border border-slate-800 w-full p-4 text-xs rounded-xl h-56 min-h-[8rem] max-h-[40rem] focus:outline-none focus:border-indigo-500 transition-colors duration-200 text-slate-300 leading-relaxed resize-y shadow-inner" />
                    </div>
                    
                    {/* HAKUPAINIKKEET JA LISÄHAKUSANAT */}
                    <div className="grid grid-cols-1 gap-2">
                        <button onClick={() => centerOnMap(selectedNode)} className="py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-[10px] font-black tracking-widest flex items-center justify-center transition-all shadow-lg active:scale-95 text-white"><MapPin size={14} className="mr-2"/> KESKITÄ KARTALLA</button>
                        <input 
                            type="text" 
                            placeholder="➕ Omat lisähakusanat (esim. 'konkurssi', 'Venäjä')..." 
                            value={customKeywords} 
                            onChange={(e) => setCustomKeywords(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 px-3 py-2.5 rounded-xl text-xs focus:border-indigo-500 outline-none text-slate-300 shadow-inner mb-2"
                        />
                        <button onClick={() => transformAIOsint(selectedNode)} className="py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] font-black tracking-widest flex items-center justify-center transition-all shadow-lg active:scale-95"><Sparkles size={14} className="mr-2"/> AI OSINT -TIEDUSTELU</button>
                        <button onClick={() => transformWikipedia(selectedNode)} className="py-3.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-[10px] font-black tracking-widest flex items-center justify-center transition-all active:scale-95"><Globe size={14} className="mr-2"/> WIKIPEDIA-PROFIILI</button>
                        <button onClick={() => transformFindConnections(selectedNode)} className="py-3.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-[10px] font-black tracking-widest flex items-center justify-center transition-all active:scale-95"><Building size={14} className="mr-2"/> ETSITÄÄN KYTKÖKSET</button>
                    </div>

                    <div className="pt-6 border-t border-slate-800">
                        <h4 className="text-[10px] uppercase font-black text-slate-500 mb-5 tracking-widest flex items-center"><ChevronRight size={14} className="text-indigo-500 mr-1"/> Rakenteinen Data</h4>
                        <div className="space-y-5">
                            {Object.entries(selectedNode.properties || {}).map(([key, val]) => (
                                <div key={key}>
                                    <label className="text-[9px] uppercase font-bold text-slate-600 block mb-1.5 tracking-wider">{key}</label>
                                    <input type="text" value={val} onChange={(e) => {const np = {...selectedNode.properties, [key]: e.target.value}; setNodes(nodes.map(n => n.id === selectedNode.id ? {...n, properties: np} : n));}} className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs focus:border-indigo-500 outline-none text-slate-300 shadow-inner" />
                                </div>
                            ))}
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label className="text-[9px] uppercase font-bold text-slate-600 block mb-1.5">Lat</label>
                                    <input type="number" step="0.0001" value={selectedNode.lat} onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? {...n, lat: parseFloat(e.target.value)} : n))} className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-[10px] font-mono" />
                                </div>
                                <div>
                                    <label className="text-[9px] uppercase font-bold text-slate-600 block mb-1.5">Lng</label>
                                    <input type="number" step="0.0001" value={selectedNode.lng} onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? {...n, lng: parseFloat(e.target.value)} : n))} className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-[10px] font-mono" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
          )}

          {/* --- AIKAJANA JA TIETOKANTA (MUUT VÄLILEHDET) --- */}
          {activeTab === 'timeline' && (
             <div className="p-10 overflow-y-auto h-full space-y-10 bg-[#0B1120] animate-in fade-in duration-500">
                <h2 className="text-2xl font-black tracking-widest uppercase flex items-center text-white"><Clock className="mr-4 text-indigo-400" size={28}/> Tapahtuma-aikajana</h2>
                <div className="space-y-8 max-w-4xl relative">
                <div className="absolute left-[9px] top-4 bottom-4 w-0.5 bg-slate-800"></div>
                {nodes.sort((a,b) => new Date(a.date)-new Date(b.date)).map(n => (
                    <div key={n.id} className="flex space-x-8 relative group">
                        <div className="w-5 h-5 rounded-full bg-slate-900 border-4 border-indigo-500 z-10 mt-1 shadow-[0_0_15px_rgba(99,102,241,0.5)] group-hover:scale-125 transition-transform duration-300"></div>
                        <div className="bg-slate-900/40 p-6 rounded-3xl border border-slate-800/50 flex-1 hover:border-indigo-500/40 transition-all cursor-pointer shadow-xl backdrop-blur-sm" onClick={() => {setSelectedNodeId(n.id); setActiveTab('graph');}}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] font-mono font-black text-indigo-400 bg-indigo-900/30 px-3 py-1 rounded-full uppercase tracking-tighter">{n.date}</span>
                                <span className={`text-[9px] font-black uppercase tracking-tighter ${getRiskColor(n.risk)}`}>{n.risk} RISK</span>
                            </div>
                            <h3 className="font-bold text-xl text-slate-100 mt-2">{n.label}</h3>
                            <p className="text-xs text-slate-500 mt-3 leading-relaxed line-clamp-3">{n.info}</p>
                        </div>
                    </div>
                ))}
                </div>
             </div>
          )}

          {activeTab === 'database' && (
             <div className="p-10 h-full overflow-auto bg-[#0B1120] animate-in fade-in duration-500">
                <h2 className="text-2xl font-black tracking-widest uppercase mb-10 flex items-center text-white"><Database className="mr-4 text-indigo-400" size={28}/> Rakenteinen Tietokanta</h2>
                <div className="bg-slate-900/40 rounded-[2rem] border border-slate-800 overflow-hidden shadow-2xl backdrop-blur-xl max-w-6xl">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="text-slate-500 uppercase font-black tracking-[0.2em] bg-slate-900/80">
                            <tr className="border-b border-slate-800">
                                <th className="py-5 px-8">Kategoria</th>
                                <th className="px-8">Kohde</th>
                                <th className="px-8 text-center">Riskiarvio</th>
                                <th className="px-8 font-mono">Geokoordinaatit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {nodes.map(n => (
                                <tr key={n.id} className="hover:bg-indigo-500/5 transition-colors cursor-pointer group" onClick={() => {setSelectedNodeId(n.id); setActiveTab('graph');}}>
                                    <td className="py-5 px-8 uppercase font-bold text-slate-500 flex items-center"><span className="p-2 bg-slate-800 rounded-lg mr-3 group-hover:text-indigo-400 transition-colors">{getNodeIcon(n.type)}</span>{n.type}</td>
                                    <td className="px-8 font-black text-slate-200 text-sm tracking-tight">{n.label}</td>
                                    <td className="px-8 text-center"><span className={`uppercase font-black px-3 py-1 rounded-lg text-[9px] bg-slate-950 border border-slate-800 ${getRiskColor(n.risk)}`}>{n.risk}</span></td>
                                    <td className="px-8 font-mono text-slate-500 tracking-tighter">{n.lat.toFixed(5)}, {n.lng.toFixed(5)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </div>
          )}

          {/* --- MODAALIT JA LATAUS-ILMOITUKSET --- */}
          
          {isLoading && (
            <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center text-center">
                <div className="bg-slate-900 p-16 rounded-[3rem] border border-indigo-500/30 shadow-2xl">
                    <RefreshCw className="animate-spin text-indigo-400 mb-8 mx-auto" size={64} />
                    <h3 className="font-black tracking-[0.3em] text-white uppercase text-sm mb-2">{loadingText}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">NEXUS DATA LINK ACTIVE</p>
                </div>
            </div>
          )}

          {isNlpModalOpen && (
            <div className="absolute inset-0 z-[80] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in zoom-in duration-300">
                <div className="bg-slate-900 border border-slate-700 w-full max-w-3xl rounded-[2.5rem] overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-800/20">
                        <span className="font-black uppercase text-xs tracking-[0.3em] text-indigo-400 flex items-center"><FileText size={18} className="mr-3"/> DOKUMENTTIANALYYSI (NLP)</span>
                        <button onClick={() => setIsNlpModalOpen(false)} className="text-slate-500 hover:text-white transition-colors p-2"><X size={28}/></button>
                    </div>
                    <div className="p-10 text-center">
                        <p className="text-sm text-slate-400 mb-8 leading-relaxed">Liitä tähän tiedusteluraportti, uutisartikkeli tai viranomaisasiakirja. Nexus-tekoäly poimii tekstistä automaattisesti henkilöt, organisaatiot ja sijainnit, ja rakentaa niistä verkoston suoraan kankaalle.</p>
                        <textarea value={nlpInputText} onChange={(e) => setNlpInputText(e.target.value)} placeholder="Syötä raakateksti tähän analysoitavaksi..." className="w-full h-80 bg-slate-950 border border-slate-800 p-6 text-sm rounded-[1.5rem] focus:outline-none focus:border-indigo-500 transition-all text-slate-300 leading-relaxed resize-none shadow-inner mb-8" />
                        <button onClick={ingestDocument} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 rounded-[1.5rem] font-black uppercase text-xs tracking-[0.3em] text-white shadow-xl transition-all active:scale-95 flex items-center justify-center">
                            <Sparkles size={20} className="mr-3"/> ANALYSOI JA RAKENNA VERKKO
                        </button>
                    </div>
                </div>
            </div>
          )}

          {showAlerts && (
            <div className="absolute top-16 right-20 w-96 bg-slate-900/95 border border-slate-700 rounded-3xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl animate-in slide-in-from-top-4 duration-300">
                <div className="p-4 border-b border-slate-800 font-black text-[10px] uppercase tracking-widest text-slate-400 bg-slate-800/40">Järjestelmähälytykset ({alerts.length})</div>
                <div className="max-h-96 overflow-y-auto">
                    {alerts.length === 0 ? (
                        <div className="p-8 text-center text-slate-600 italic text-xs">Ei aktiivisia hälytyksiä.</div>
                    ) : (
                        alerts.map(a => (
                            <div key={a.id} className={`p-5 border-b border-slate-800/50 flex items-start space-x-4 ${a.level === 'critical' ? 'bg-red-500/5' : 'bg-amber-500/5'}`}>
                                <AlertTriangle className={a.level === 'critical' ? 'text-red-400' : 'text-amber-400'} size={18}/>
                                <div>
                                    <p className="text-xs text-slate-200 leading-relaxed font-medium">{a.message}</p>
                                    <span className="text-[9px] uppercase font-black text-slate-600 mt-2 block tracking-widest">Priority: {a.level}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}