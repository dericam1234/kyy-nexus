import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Network, Database, Search, User, Building, MapPin, Shield, Activity, 
  ChevronRight, Maximize, Crosshair, Plus, Trash2, ZoomIn, ZoomOut, 
  RefreshCw, Globe, AlertTriangle, Save, Sparkles, ExternalLink,
  Map as MapIcon, Clock, Bell, FileText, CheckCircle2, X
} from 'lucide-react';

// --- APUFUNKTIOT JA ASETUKSET ---
const generateId = () => Math.random().toString(36).substr(2, 9);

// SYÖTÄ TÄHÄN GOOGLEN GEMINI API-AVAIN (Käytetään NLP, Yhtiöhaku ja OSINT -toiminnoissa)
const apiKey = "AIzaSyAZ5mawe0picS8FEkUawxK-w83JLD6nKS8"; 

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

// Luotettava verkkokutsujen uudelleenyrityslogiikka API-hakuja varten
const fetchWithBackoff = async (url, options, retries = 3, delay = 1000) => {
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res;
  } catch (error) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return fetchWithBackoff(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
};

// --- ONTOLOGIA (Mitä tietoja eri tyyppisillä solmuilla pitää olla) ---
const getOntologyProperties = (type) => {
  switch (type) {
    case 'person': return { nationality: '', ssn: '', aliases: '' };
    case 'org': return { registryNumber: '', industry: '', founded: '' };
    case 'location': return { address: '', coordinates: '', accessLevel: '' };
    case 'event': return { date: '', status: '', severity: '' };
    default: return {};
  }
};

// Alkudata päivitetyllä ontologialla ja spatiaalisilla tiedoilla
const defaultNodes = [
  { 
    id: '1', label: 'Matti Virtanen', type: 'person', 
    x: 400, y: 300, lat: 60.1699, lng: 24.9384, date: '2023-10-15',
    info: 'Epäilty päätekijä. Aloita tutkinta tästä.', risk: 'high',
    properties: { nationality: 'Suomi', ssn: '151080-XXXX', aliases: 'MaZa' }
  },
  { 
    id: '2', label: 'Satama B', type: 'location', 
    x: 200, y: 400, lat: 60.1550, lng: 24.9500, date: '2023-10-12',
    info: 'Havaittu epämääräistä toimintaa.', risk: 'medium',
    properties: { address: 'Satamakatu 1', coordinates: '60.1550, 24.9500', accessLevel: 'Rajoitettu' }
  }
];

const defaultEdges = [
  { source: '1', target: '2', label: 'Havaittu alueella', date: '2023-10-14' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('graph');
  
  const [nodes, setNodes] = useState(() => JSON.parse(localStorage.getItem('nexus_nodes_v2')) || defaultNodes);
  const [edges, setEdges] = useState(() => JSON.parse(localStorage.getItem('nexus_edges_v2')) || defaultEdges);
  
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Hahmontunnistuksen hälytykset
  const [alerts, setAlerts] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggingNode, setDraggingNode] = useState(null);
  const [isDragged, setIsDragged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  
  // NLP Modaalin tilamuuttujat
  const [isNlpModalOpen, setIsNlpModalOpen] = useState(false);
  const [nlpInputText, setNlpInputText] = useState('');

  const svgRef = useRef(null);

  // Tallennus ja Hahmontunnistus (Pattern Engine)
  useEffect(() => {
    localStorage.setItem('nexus_nodes_v2', JSON.stringify(nodes));
    localStorage.setItem('nexus_edges_v2', JSON.stringify(edges));

    // PATTERN RECOGNITION ENGINE (Analysoi verkkoa taustalla)
    const newAlerts = [];
    
    // Sääntö 1: Korkean riskin entiteetti yhdistetty suoraan uuteen paikkaan tai tapahtumaan
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      
      if (source && target) {
        if (source.risk === 'high' && ['location', 'event'].includes(target.type)) {
          newAlerts.push({
            id: `${source.id}-${target.id}`,
            level: 'critical',
            message: `Kriittinen yhteys: Korkean riskin kohde (${source.label}) kytkeytyy solmuun ${target.label}.`
          });
        }
      }
    });

    // Sääntö 2: Eristetyt (irralliset) korkean riskin entiteetit
    nodes.forEach(node => {
      if (node.risk === 'high') {
        const hasConnections = edges.some(e => e.source === node.id || e.target === node.id);
        if (!hasConnections) {
          newAlerts.push({
            id: `isolated-${node.id}`,
            level: 'warning',
            message: `Havaittu eristetty korkean riskin kohde: ${node.label}. Suosittelemme OSINT-tiedustelua.`
          });
        }
      }
    });

    // Päivitetään hälytykset vain jos ne ovat muuttuneet
    if (JSON.stringify(alerts.map(a=>a.id)) !== JSON.stringify(newAlerts.map(a=>a.id))) {
      setAlerts(newAlerts);
    }
  }, [nodes, edges]);

  // --- INTERAKTIOT JA KÄYTTÖLIITTYMÄ ---
  
  // Apufunktio koordinaattipohjaiseen zoomaukseen
  const performZoom = (zoomFactor, centerX, centerY) => {
    setCamera(prev => {
      let newZoom = prev.zoom * zoomFactor;
      newZoom = Math.max(0.2, Math.min(newZoom, 5));
      
      // Kohdennetaan zoomaus keski- tai hiiripisteeseen (Zoom to center/pointer)
      const worldX = (centerX - prev.x) / prev.zoom;
      const worldY = (centerY - prev.y) / prev.zoom;
      
      const newX = centerX - worldX * newZoom;
      const newY = centerY - worldY * newZoom;
      
      return { x: newX, y: newY, zoom: newZoom };
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    if (!svgRef.current) return;
    
    // Laske hiiren sijainti SVG-elementillä
    const svgRect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left;
    const mouseY = e.clientY - svgRect.top;

    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    
    performZoom(1 + delta, mouseX, mouseY);
  };

  const handleZoomInButton = () => {
    if(svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      performZoom(1.2, rect.width / 2, rect.height / 2);
    }
  };

  const handleZoomOutButton = () => {
    if(svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      performZoom(1 / 1.2, rect.width / 2, rect.height / 2);
    }
  };

  const handleMouseDownNode = (e, nodeId) => {
    e.stopPropagation();
    setDraggingNode(nodeId);
    setIsDragged(false);
  };

  const handleMouseDownCanvas = () => setIsPanning(true);

  const handleMouseMove = useCallback((e) => {
    if (draggingNode && activeTab === 'graph') {
      setIsDragged(true);
      // Liikkumismatka maailman koordinaateissa (otetaan huomioon zoomaustaso)
      const movementX = e.movementX / camera.zoom;
      const movementY = e.movementY / camera.zoom;
      setNodes(prev => prev.map(n => 
        n.id === draggingNode ? { ...n, x: n.x + movementX, y: n.y + movementY } : n
      ));
    } else if (isPanning) {
      // Panning liikuttaa suoraan kameraa
      setCamera(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }));
    }
  }, [draggingNode, isPanning, camera.zoom, activeTab]);

  const handleMouseUp = () => {
    setDraggingNode(null);
    setIsPanning(false);
    setTimeout(() => setIsDragged(false), 50);
  };

  const handleNodeClick = (e, nodeId) => {
    e.stopPropagation();
    if (!isDragged) setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
  };

  const handleBackgroundClick = () => {
    if (!isDragged && !isPanning) setSelectedNodeId(null);
  };

  // --- TYÖKALUT ---
  const addNewNode = () => {
    const newNode = {
      id: generateId(),
      label: 'Uusi Entiteetti',
      type: 'person',
      // Luodaan solmu ruudun keskelle, huomioiden kameran offsetin ja zoomin
      x: (-camera.x + window.innerWidth / 2) / camera.zoom,
      y: (-camera.y + window.innerHeight / 2) / camera.zoom,
      lat: 60 + (Math.random() * 2 - 1), 
      lng: 24 + (Math.random() * 2 - 1),
      date: new Date().toISOString().split('T')[0],
      info: 'Uusi manuaalisesti luotu entiteetti.',
      risk: 'low',
      properties: getOntologyProperties('person')
    };
    setNodes([...nodes, newNode]);
    setSelectedNodeId(newNode.id);
  };

  const deleteNode = (id) => {
    setNodes(nodes.filter(n => n.id !== id));
    setEdges(edges.filter(e => e.source !== id && e.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const updateNodeProperty = (id, field, value) => {
    setNodes(nodes.map(n => {
      if (n.id === id) {
        return { ...n, properties: { ...n.properties, [field]: value } };
      }
      return n;
    }));
  };

  // --- 1. NLP SIMULAATIO / AITO GEMINI API (Dokumenttien massatuonti) ---
  const ingestDocument = async () => {
    if (apiKey && !nlpInputText.trim()) return;
    setIsNlpModalOpen(false);
    setLoadingText('Analysoidaan dokumenttia (NLP/OCR)...');
    setIsLoading(true);

    const mockIngest = () => {
      setTimeout(() => {
        const orgId = generateId();
        const personId = generateId();
        
        const newOrg = {
          id: orgId, label: 'Varjopankki Ltd (Mock)', type: 'org',
          x: (-camera.x + window.innerWidth / 2) / camera.zoom + 100,
          y: (-camera.y + window.innerHeight / 2) / camera.zoom - 50,
          lat: 51.5072, lng: -0.1276, date: '2023-11-01',
          info: 'Automaattisesti purettu dokumentista (Simulaatio).', risk: 'high',
          properties: getOntologyProperties('org')
        };
        
        const newPerson = {
          id: personId, label: 'Alexey K. (Mock)', type: 'person',
          x: (-camera.x + window.innerWidth / 2) / camera.zoom + 200,
          y: (-camera.y + window.innerHeight / 2) / camera.zoom + 50,
          lat: 55.7558, lng: 37.6173, date: '2023-11-02',
          info: 'Nimi esiintyi liitteessä (Simulaatio).', risk: 'medium',
          properties: getOntologyProperties('person')
        };

        const newEdges = [];
        if (selectedNodeId) newEdges.push({ source: selectedNodeId, target: orgId, label: 'Rahansiirto havaittu', date: '2023-11-01' });
        newEdges.push({ source: orgId, target: personId, label: 'Tilinomistaja', date: '2023-11-02' });

        setNodes(prev => [...prev, newOrg, newPerson]);
        setEdges(prev => [...prev, ...newEdges]);
        setIsLoading(false);
        alert('Dokumentti analysoitu (Mock-tila). 2 uutta entiteettiä luotu.');
      }, 2000);
    };

    if (!apiKey) {
      mockIngest();
      return;
    }

    try {
      const response = await fetchWithBackoff(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Analysoi seuraava teksti ja poimi siitä erisnimet, organisaatiot, paikat ja tapahtumat. Rakenna niistä verkosto.\nPalauta VASTAUS PELKKÄNÄ JSON-TAULUKKONA (ilman markdown-blokkeja). Jokaisella objektilla pitää olla nämä kentät:\n- label: "Nimi"\n- type: "person", "org", "location" tai "event"\n- info: "Lyhyt selitys miksi mainittu"\n- lat: 60 (tai arvioitu oikea leveysaste)\n- lng: 24 (tai arvioitu oikea pituusaste)\n- risk: "low", "medium" tai "high" (kontekstin perusteella)\n- connectionLabel: "Miten tämä liittyy tekstin muihin entiteetteihin"\n\nTeksti:\n"${nlpInputText}"` }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      // Puhdistetaan tekoälyn vastaus varmuuden vuoksi
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const entities = JSON.parse(text);

      const newNodes = [];
      const newEdges = [];
      let previousId = selectedNodeId;

      entities.forEach((ent, index) => {
        const id = generateId();
        newNodes.push({
          id, label: ent.label, type: ent.type || 'person',
          x: (-camera.x + window.innerWidth / 2) / camera.zoom + (Math.random() * 200 - 100),
          y: (-camera.y + window.innerHeight / 2) / camera.zoom + (Math.random() * 200 - 100),
          lat: ent.lat || 60, lng: ent.lng || 24, date: new Date().toISOString().split('T')[0],
          info: ent.info || 'Automaattisesti poimittu tekstitiedostosta.', risk: ent.risk || 'medium',
          properties: getOntologyProperties(ent.type || 'person')
        });

        if (previousId) {
          newEdges.push({ source: previousId, target: id, label: ent.connectionLabel || 'Yhteys havaittu', date: new Date().toISOString().split('T')[0] });
        }
        previousId = id; // Ketjutetaan solmut toisiinsa
      });

      setNodes(prev => [...prev, ...newNodes]);
      setEdges(prev => [...prev, ...newEdges]);
      setNlpInputText(''); // Tyhjennetään syöte onnistumisen jälkeen
      alert('Dokumentti analysoitu onnistuneesti tekoälyllä (Aito API).');
    } catch (error) {
      console.warn("API kutsu epäonnistui, käytetään mockia.", error);
      mockIngest();
    } finally {
      setIsLoading(false);
    }
  };

  // --- 2. AI OSINT (Google Haku + Gemini) ---
  const transformAIOsint = async (sourceNode) => {
    setLoadingText('Suoritetaan AI OSINT -tiedustelua...');
    setIsLoading(true);

    const mockOsint = () => {
      setTimeout(() => {
        setNodes(prev => prev.map(n => 
          n.id === sourceNode.id ? { ...n, info: `${n.info}\n\n[OSINT MOCK]: Simuloitu hakutulos. Oikeaan tekoälyhakuun vaaditaan API-avain.` } : n
        ));
        setIsLoading(false);
      }, 1500);
    }

    if (!apiKey) {
      mockOsint();
      return;
    }

    try {
      const response = await fetchWithBackoff(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Etsi internetistä tietoa ja tee lyhyt, ytimekäs tiedusteluyhteenveto (max 3 lausetta) entiteetistä nimeltä "${sourceNode.label}". Ota huomioon tyyppi: ${sourceNode.type}. Keskity tiukasti faktoihin.` }] }],
          tools: [{ google_search: {} }]
        })
      });

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        setNodes(prev => prev.map(n => 
          n.id === sourceNode.id ? { ...n, info: text } : n
        ));
      } else {
        throw new Error("Tyhjä vastaus");
      }
    } catch (error) {
      console.warn("Tekoälyhaun suorittaminen epäonnistui.", error);
      mockOsint();
    }
    setIsLoading(false);
  };

  // --- 3. YHTIÖKYTKÖKSET (Aito Gemini JSON tai Mock) ---
  const transformFindCompanies = async (sourceNode) => {
    setLoadingText('Haetaan yhtiökytköksiä...');
    setIsLoading(true);
    
    const mockFindCompanies = () => {
      setTimeout(() => {
        const companyId = generateId();
        const newCompany = {
          id: companyId,
          label: `Oy ${sourceNode.label.split(' ')[0] || 'Yritys'} Ab (Mock)`,
          type: 'org',
          x: sourceNode.x + (Math.random() * 150 - 75),
          y: sourceNode.y + 100 + (Math.random() * 50),
          lat: (sourceNode.lat || 60) + (Math.random() * 0.1 - 0.05),
          lng: (sourceNode.lng || 24) + (Math.random() * 0.1 - 0.05),
          date: new Date().toISOString().split('T')[0],
          info: 'Automaattisesti löydetty kytkös PRH-simulaattorista (API-avain puuttuu).',
          risk: 'medium',
          properties: getOntologyProperties('org')
        };
        const newEdge = { source: sourceNode.id, target: companyId, label: 'Hallituksen jäsen', date: new Date().toISOString().split('T')[0] };
        
        setNodes(prev => [...prev, newCompany]);
        setEdges(prev => [...prev, newEdge]);
        setIsLoading(false);
      }, 1500);
    };

    if (!apiKey) {
      mockFindCompanies();
      return;
    }

    try {
      const response = await fetchWithBackoff(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Etsi todellisia yrityksiä tai organisaatioita, jotka liittyvät hakusanaan "${sourceNode.label}". Palauta JSON-taulukko, jossa on 1-2 tulosta muodossa: [{"label": "Yrityksen virallinen nimi", "info": "Miten liittyy alkuperäiseen", "lat": 60.16, "lng": 24.93, "risk": "medium", "connectionLabel": "Esim. Tytäryhtiö tai Omistaja"}]. ÄLÄ keksi nimiä, käytä Google-hakutyökalua.` }] }],
          tools: [{ google_search: {} }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const companies = JSON.parse(text);

      const newNodes = [];
      const newEdges = [];

      companies.forEach((comp) => {
        const id = generateId();
        newNodes.push({
          id, label: comp.label, type: 'org',
          x: sourceNode.x + (Math.random() * 200 - 100),
          y: sourceNode.y + 100 + (Math.random() * 50),
          lat: comp.lat || (sourceNode.lat + 0.05), lng: comp.lng || (sourceNode.lng + 0.05),
          date: new Date().toISOString().split('T')[0],
          info: comp.info || 'Tekoälyn löytämä kytkös.', risk: comp.risk || 'medium',
          properties: getOntologyProperties('org')
        });
        newEdges.push({ source: sourceNode.id, target: id, label: comp.connectionLabel || 'Yhteys', date: new Date().toISOString().split('T')[0] });
      });

      setNodes(prev => [...prev, ...newNodes]);
      setEdges(prev => [...prev, ...newEdges]);
    } catch (error) {
      console.warn("Yrityshaku API:n kautta epäonnistui, käytetään mockia.", error);
      mockFindCompanies();
    } finally {
      setIsLoading(false);
    }
  };

  // --- WIKIPEDIA (Aito ilmainen API) ---
  const transformWikipediaSearch = async (sourceNode) => {
    setLoadingText('Haetaan Wikipedia-verkosta...');
    setIsLoading(true);
    try {
      const response = await fetch(`https://fi.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(sourceNode.label)}`);
      if (response.ok) {
        const data = await response.json();
        setNodes(prev => prev.map(n => 
          n.id === sourceNode.id ? { 
            ...n, 
            info: data.extract || 'Tietoa löytyi, mutta ei tiivistelmää.', 
            wikiUrl: data.content_urls?.desktop?.page 
          } : n
        ));
      } else {
        alert("Ei osumia Wikipediasta.");
      }
    } catch (error) {}
    setIsLoading(false);
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const filteredNodes = nodes.filter(n => 
    n.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-full bg-[#0B1120] text-slate-300 font-sans overflow-hidden select-none">
      
      {/* --- VASEMMAN PALKIN NAVIGAATIO --- */}
      <div className="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 space-y-6 z-30">
        <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4 cursor-pointer">
          <Crosshair className="text-white" size={24} />
        </div>
        
        <div className="flex flex-col space-y-2 w-full">
          <button onClick={() => setActiveTab('graph')} className={`w-full py-3 flex justify-center transition-colors ${activeTab === 'graph' ? 'text-indigo-400 border-r-2 border-indigo-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`} title="Verkkoanalyysi"><Network size={22} /></button>
          <button onClick={() => setActiveTab('map')} className={`w-full py-3 flex justify-center transition-colors ${activeTab === 'map' ? 'text-indigo-400 border-r-2 border-indigo-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`} title="Spatiaalinen analyysi (Kartta)"><MapIcon size={22} /></button>
          <button onClick={() => setActiveTab('timeline')} className={`w-full py-3 flex justify-center transition-colors ${activeTab === 'timeline' ? 'text-indigo-400 border-r-2 border-indigo-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`} title="Aikajana"><Clock size={22} /></button>
          <button onClick={() => setActiveTab('database')} className={`w-full py-3 flex justify-center transition-colors ${activeTab === 'database' ? 'text-indigo-400 border-r-2 border-indigo-400 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`} title="Tietokanta"><Database size={22} /></button>
        </div>

        <div className="mt-auto pt-6 flex flex-col space-y-2 w-full border-t border-slate-800">
          <button onClick={() => setIsNlpModalOpen(true)} className="w-full py-3 flex justify-center text-indigo-300 hover:text-indigo-100 bg-indigo-900/20 hover:bg-indigo-900/40" title="NLP Dokumenttianalyysi"><FileText size={20} /></button>
          <button onClick={addNewNode} className="w-full py-3 flex justify-center text-emerald-400 hover:text-emerald-300 bg-emerald-900/10 hover:bg-emerald-900/30" title="Lisää entiteetti"><Plus size={22} /></button>
        </div>
      </div>

      {/* --- PÄÄALUE --- */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* YLÄPALKKI */}
        <div className="h-14 bg-slate-900/95 backdrop-blur border-b border-slate-800 flex items-center justify-between px-6 z-30">
          <div className="flex items-center space-x-6">
            <h1 className="text-lg font-semibold tracking-wider text-slate-100 flex items-center">
              NEXUS <span className="text-indigo-400 ml-2 font-normal text-xs px-2 py-0.5 bg-indigo-500/10 rounded border border-indigo-500/20">GOTHAM EDITION</span>
            </h1>
            
            {(activeTab === 'graph' || activeTab === 'map') && (
              <div className="flex items-center space-x-2 border-l border-slate-700 pl-6">
                <button onClick={handleZoomInButton} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"><ZoomIn size={18} /></button>
                <button onClick={handleZoomOutButton} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"><ZoomOut size={18} /></button>
                <button onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white ml-2 text-xs font-medium flex items-center">
                  <Maximize size={14} className="mr-1" /> Keskitä
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Hälytyskeskus */}
            <div className="relative">
              <button 
                onClick={() => setShowAlerts(!showAlerts)}
                className={`relative p-2 rounded-full transition-colors ${alerts.length > 0 ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'text-slate-500 hover:bg-slate-800'}`}
              >
                <Bell size={18} />
                {alerts.length > 0 && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border border-slate-900"></span>}
              </button>
              
              {showAlerts && (
                <div className="absolute right-0 top-10 w-80 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg overflow-hidden z-50">
                  <div className="bg-slate-800 p-3 text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-700">Järjestelmähälytykset ({alerts.length})</div>
                  <div className="max-h-64 overflow-y-auto">
                    {alerts.length === 0 ? (
                      <div className="p-4 text-sm text-slate-500 text-center">Ei aktiivisia hälytyksiä.</div>
                    ) : (
                      alerts.map(alert => (
                        <div key={alert.id} className={`p-3 border-b border-slate-800/50 text-sm flex items-start ${alert.level === 'critical' ? 'bg-red-950/20' : 'bg-amber-950/20'}`}>
                          <AlertTriangle size={16} className={`mr-2 flex-shrink-0 mt-0.5 ${alert.level === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                          <span className="text-slate-300">{alert.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={16} />
              <input 
                type="text" 
                placeholder="Suodata näkymää..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-700 text-sm rounded-full pl-9 pr-4 py-1.5 focus:outline-none focus:border-indigo-500 w-64"
              />
            </div>
          </div>
        </div>

        {/* --- TYÖTILAT (VÄLILEHDET) --- */}
        <div className="flex-1 relative overflow-hidden">
          
          {/* VERKKO & KARTTA NÄKYMÄT (SVG POHJAISET) */}
          {(activeTab === 'graph' || activeTab === 'map') && (
            <>
              {/* Taustat: Verkolle normaali ristikko, Kartalle "tutka/koordinaatisto" */}
              {activeTab === 'graph' ? (
                <div className="absolute inset-0 pointer-events-none opacity-10" style={{
                  backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.2) 1px, transparent 1px)',
                  backgroundSize: `${40 * camera.zoom}px ${40 * camera.zoom}px`, backgroundPosition: `${camera.x}px ${camera.y}px`
                }}></div>
              ) : (
                <div className="absolute inset-0 pointer-events-none bg-emerald-950/10 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 opacity-20" style={{
                    backgroundImage: 'radial-gradient(circle at center, transparent 0, transparent 20px, #10b981 21px, transparent 22px)',
                    backgroundSize: '200px 200px', backgroundPosition: 'center'
                  }}></div>
                  <div className="absolute top-4 left-4 text-emerald-500/50 font-mono text-xs tracking-widest pointer-events-none">GEOSPATIAL PROJECTION // LAT/LNG MAPPING</div>
                  <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)', backgroundSize: '100px 100px', backgroundPosition: `${camera.x}px ${camera.y}px` }}></div>
                </div>
              )}

              <svg 
                ref={svgRef}
                className={`absolute inset-0 w-full h-full ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
                onWheel={handleWheel} onMouseDown={handleMouseDownCanvas} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onClick={handleBackgroundClick}
              >
                {/* Palautettu luonnollinen scale(), jotta koordinaatisto ja välimatkat muuttuvat */}
                <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
                  
                  {/* Lasketaan "käänteinen zoomaus". Sisään zoomattaessa (>1) solmut skaalataan vastakkaiseen suuntaan, jotta ne pysyvät ruudulla saman kokoisina. Ulos zoomattaessa (<1) niiden annetaan pienentyä luonnollisesti. */}
                  {(() => {
                    const inverseZoom = camera.zoom > 1 ? 1 / camera.zoom : 1;
                    
                    return (
                      <>
                        {/* Edges */}
                        {edges.map((edge, i) => {
                          const sourceNode = nodes.find(n => n.id === edge.source);
                          const targetNode = nodes.find(n => n.id === edge.target);
                          if (!sourceNode || !targetNode) return null;
                          
                          // Hae peruskoordinaatit välilehdestä riippuen
                          const sX = activeTab === 'map' ? (sourceNode.lng * 20) : sourceNode.x;
                          const sY = activeTab === 'map' ? (-sourceNode.lat * 20) + 1200 : sourceNode.y;
                          const tX = activeTab === 'map' ? (targetNode.lng * 20) : targetNode.x;
                          const tY = activeTab === 'map' ? (-targetNode.lat * 20) + 1200 : targetNode.y;

                          const isSelected = selectedNodeId === sourceNode.id || selectedNodeId === targetNode.id;
                          const midX = (sX + tX) / 2; 
                          const midY = (sY + tY) / 2;

                          return (
                            <g key={`edge-${i}`}>
                              <line 
                                x1={sX} y1={sY} x2={tX} y2={tY} 
                                className={`transition-colors duration-300 ${activeTab === 'map' ? 'stroke-emerald-900' : 'stroke-slate-700/80'} ${isSelected ? (activeTab === 'map' ? 'stroke-emerald-400' : 'stroke-indigo-400') : ''}`}
                                strokeWidth={isSelected ? 3 / camera.zoom : 1.5 / camera.zoom}
                              />
                              <g transform={`translate(${midX}, ${midY}) scale(${inverseZoom})`}>
                                <rect x="-10" y="-10" width="20" height="20" fill="#0B1120" rx="4" className={`transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}`}/>
                                <text x="0" y="4" textAnchor="middle" className={`text-[10px] select-none pointer-events-none transition-opacity duration-300 ${isSelected ? 'fill-indigo-300 opacity-100' : 'fill-slate-500 opacity-0'}`}>{edge.label}</text>
                              </g>
                            </g>
                          );
                        })}

                        {/* Nodes */}
                        {nodes.map((node) => {
                          const isSelected = selectedNodeId === node.id;
                          if (searchQuery && !node.label.toLowerCase().includes(searchQuery.toLowerCase()) && !node.type.toLowerCase().includes(searchQuery.toLowerCase())) return null;

                          const posX = activeTab === 'map' ? (node.lng * 20) : node.x;
                          const posY = activeTab === 'map' ? (-node.lat * 20) + 1200 : node.y;

                          return (
                            <g 
                              key={node.id}
                              transform={`translate(${posX}, ${posY}) scale(${inverseZoom})`}
                              onMouseDown={(e) => handleMouseDownNode(e, node.id)} onClick={(e) => handleNodeClick(e, node.id)}
                              className="cursor-pointer"
                            >
                              {isSelected && (
                                <circle r="32" className={`fill-transparent stroke-2 stroke-dasharray-[4,4] ${activeTab === 'map' ? 'stroke-emerald-400' : 'stroke-indigo-400'}`}>
                                  <animate attributeName="stroke-dashoffset" values="0;8" dur="1s" repeatCount="indefinite" />
                                </circle>
                              )}
                              <circle r="22" className={`${getNodeColor(node.type)} stroke-[3px] shadow-2xl transition-colors hover:brightness-125`} />
                              <text y="5" textAnchor="middle" className="fill-slate-900 font-bold text-lg pointer-events-none">
                                {node.type === 'person' ? 'P' : node.type === 'org' ? 'C' : node.type === 'location' ? 'L' : '?'}
                              </text>
                              <rect x="-40" y="32" width="80" height="20" rx="4" fill="#0f172a" fillOpacity="0.8" className="stroke-slate-700" strokeWidth="1" />
                              <text y="45" textAnchor="middle" className={`text-[11px] font-medium pointer-events-none drop-shadow-md ${isSelected ? 'fill-white' : 'fill-slate-300'}`}>
                                {node.label.length > 12 ? node.label.substring(0, 10) + '...' : node.label}
                              </text>
                              
                              {/* Näytä koordinaatit pienenä karttatilassa */}
                              {activeTab === 'map' && isSelected && (
                                <text y="60" textAnchor="middle" className="text-[9px] fill-emerald-400 font-mono pointer-events-none">
                                  {Number(node.lat).toFixed(2)}, {Number(node.lng).toFixed(2)}
                                </text>
                              )}
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

          {/* 3. AIKAJANA (TIMELINE) */}
          {activeTab === 'timeline' && (
            <div className="absolute inset-0 p-8 overflow-auto z-10 bg-[#0B1120]">
              <h2 className="text-xl font-semibold mb-8 text-white flex items-center border-b border-slate-800 pb-4">
                <Clock className="mr-3 text-indigo-400" /> Tapahtumien aikajana
              </h2>
              
              <div className="relative border-l-2 border-indigo-900 ml-6 space-y-8 pb-12">
                {[...nodes].sort((a, b) => new Date(a.date || '2000-01-01') - new Date(b.date || '2000-01-01')).map((node, i) => (
                  <div key={i} className="relative pl-8">
                    <div className={`absolute -left-2.5 top-1.5 w-5 h-5 rounded-full border-4 border-[#0B1120] ${getNodeColor(node.type).split(' ')[0]}`}></div>
                    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 max-w-2xl hover:border-indigo-500/50 transition-colors cursor-pointer" onClick={() => { setSelectedNodeId(node.id); setActiveTab('graph'); }}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-mono text-indigo-400 bg-indigo-900/20 px-2 py-1 rounded">{node.date || 'Tuntematon'}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${getRiskColor(node.risk)}`}>{node.risk}</span>
                      </div>
                      <h3 className="text-lg font-bold text-white flex items-center mb-1">
                        <span className="mr-2 opacity-70">{getNodeIcon(node.type)}</span> {node.label}
                      </h3>
                      <p className="text-sm text-slate-400">{node.info}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. TIETOKANTANÄKYMÄ */}
          {activeTab === 'database' && (
            <div className="absolute inset-0 p-8 overflow-auto z-10 bg-[#0B1120]">
              <h2 className="text-xl font-semibold mb-6 text-white flex items-center">
                <Database className="mr-3 text-indigo-400" /> Raakadata ({nodes.length} tietuetta)
              </h2>
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wider">
                      <th className="p-4 border-b border-slate-700">Tyyppi</th>
                      <th className="p-4 border-b border-slate-700">Nimi</th>
                      <th className="p-4 border-b border-slate-700">Riskiluokitus</th>
                      <th className="p-4 border-b border-slate-700">Aikaleima</th>
                      <th className="p-4 border-b border-slate-700">Toiminnot</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {filteredNodes.map(node => (
                      <tr key={node.id} className="border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors">
                        <td className="p-4"><span className="flex items-center text-slate-400 w-max"><span className="mr-2">{getNodeIcon(node.type)}</span>{node.type}</span></td>
                        <td className="p-4 font-medium text-slate-200">{node.label}</td>
                        <td className="p-4"><span className={`${getRiskColor(node.risk)} uppercase text-xs font-bold`}>{node.risk}</span></td>
                        <td className="p-4 font-mono text-xs text-slate-500">{node.date || '-'}</td>
                        <td className="p-4 flex space-x-3">
                          <button className="text-indigo-400 hover:text-indigo-300" onClick={() => { setSelectedNodeId(node.id); setActiveTab('graph'); }}><Maximize size={16} /></button>
                          <button className="text-red-400 hover:text-red-300" onClick={() => deleteNode(node.id)}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- OIKEA SIVUPALKKI (ONTOLOGIA JA OMINAISUUDET) --- */}
          {(activeTab === 'graph' || activeTab === 'map') && selectedNode && (
            <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl z-30 flex flex-col transform transition-transform duration-300">
              
              <div className="p-5 border-b border-slate-800 bg-slate-900">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-500 bg-slate-800 p-1.5 rounded">{getNodeIcon(selectedNode.type)}</span>
                    <select 
                      value={selectedNode.type} 
                      onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, type: e.target.value, properties: getOntologyProperties(e.target.value) } : n))}
                      className="bg-transparent text-xs uppercase tracking-wider text-slate-400 font-semibold focus:outline-none cursor-pointer"
                    >
                      <option value="person">Henkilö</option>
                      <option value="org">Organisaatio</option>
                      <option value="location">Sijainti</option>
                      <option value="event">Tapahtuma</option>
                    </select>
                  </div>
                  <button onClick={() => setSelectedNodeId(null)} className="text-slate-500 hover:text-white">&times;</button>
                </div>
                <input 
                  type="text" value={selectedNode.label}
                  onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, label: e.target.value } : n))}
                  className="w-full bg-transparent text-xl font-bold text-white focus:outline-none focus:border-b focus:border-indigo-500 border-b border-transparent pb-1"
                />
              </div>
              
              <div className="flex-1 overflow-y-auto">
                {/* Tiedustelu */}
                <div className="p-5 border-b border-slate-800/50">
                  <h4 className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 font-bold">Yleiset Tilitiedot</h4>
                  <textarea 
                    value={selectedNode.info}
                    onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, info: e.target.value } : n))}
                    className="w-full text-sm text-slate-300 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800 focus:border-indigo-500 focus:outline-none min-h-[60px] resize-y mb-3"
                  />
                  
                  <div className="flex flex-col space-y-2 mb-4">
                    {selectedNode.wikiUrl && (
                      <a href={selectedNode.wikiUrl} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 hover:text-indigo-300 inline-flex items-center">
                        <Globe size={10} className="mr-1" /> Avaa Wikipedia-artikkeli
                      </a>
                    )}
                    <a href={`https://www.google.com/search?q=${encodeURIComponent(selectedNode.label)}`} target="_blank" rel="noreferrer" className="text-[10px] text-indigo-400 hover:text-indigo-300 inline-flex items-center">
                      <ExternalLink size={10} className="mr-1" /> Hae Googlesta (Uusi välilehti)
                    </a>
                  </div>
                  
                  <div className="flex space-x-2">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase text-slate-500 block mb-1">Aikaleima</label>
                      <input type="date" value={selectedNode.date || ''} onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, date: e.target.value } : n))} className="w-full bg-slate-950 text-slate-300 text-xs p-2 rounded border border-slate-800" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] uppercase text-slate-500 block mb-1">Riski</label>
                      <select value={selectedNode.risk} onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, risk: e.target.value } : n))} className={`w-full bg-slate-950 text-xs p-2 rounded border border-slate-800 ${getRiskColor(selectedNode.risk)}`}>
                        <option value="low" className="text-emerald-400">Matala</option><option value="medium" className="text-amber-400">Kohtalainen</option><option value="high" className="text-red-400">Korkea</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Tiukka Ontologia */}
                <div className="p-5 border-b border-slate-800/50 bg-slate-900/50">
                  <h4 className="text-[10px] uppercase tracking-wider text-indigo-400 mb-3 font-bold flex items-center"><Database size={12} className="mr-1"/> Ontologia-ominaisuudet</h4>
                  <div className="space-y-3">
                    {selectedNode.properties && Object.keys(selectedNode.properties).map(key => (
                      <div key={key}>
                        <label className="text-[10px] uppercase text-slate-500 block mb-1">{key}</label>
                        <input 
                          type="text" value={selectedNode.properties[key] || ''} 
                          onChange={(e) => updateNodeProperty(selectedNode.id, key, e.target.value)}
                          className="w-full bg-slate-950 text-slate-300 text-xs p-2 rounded border border-slate-800 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    ))}
                    
                    {/* Sijainti koordinaatit erikseen */}
                    <div className="flex space-x-2 pt-2 border-t border-slate-800 mt-2">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase text-slate-500 block mb-1">Lat</label>
                        <input type="number" step="0.0001" value={selectedNode.lat || ''} onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, lat: parseFloat(e.target.value) } : n))} className="w-full bg-slate-950 text-slate-300 text-xs p-1.5 rounded border border-slate-800" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] uppercase text-slate-500 block mb-1">Lng</label>
                        <input type="number" step="0.0001" value={selectedNode.lng || ''} onChange={(e) => setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, lng: parseFloat(e.target.value) } : n))} className="w-full bg-slate-950 text-slate-300 text-xs p-1.5 rounded border border-slate-800" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Integraatiot */}
                <div className="p-5 border-b border-slate-800/50 bg-indigo-950/10">
                  <h4 className="text-[10px] uppercase tracking-wider text-slate-500 mb-3 font-bold">Integraatiot (Transforms)</h4>
                  <div className="space-y-2">
                    <button onClick={() => transformAIOsint(selectedNode)} className="w-full bg-indigo-900/40 hover:bg-indigo-900/60 border border-indigo-700/50 p-2 rounded text-xs flex items-center transition-colors">
                      <Sparkles size={14} className="text-indigo-400 mr-2" /> AI OSINT (Google Haku)
                    </button>
                    <button onClick={() => transformWikipediaSearch(selectedNode)} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2 rounded text-xs flex items-center transition-colors">
                      <Globe size={14} className="text-blue-400 mr-2" /> Etsi OSINT-tieto (Wikipedia)
                    </button>
                    <button onClick={() => transformFindCompanies(selectedNode)} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 p-2 rounded text-xs flex items-center transition-colors">
                      <Building size={14} className="text-purple-400 mr-2" /> Hae yhtiökytkökset (PRH)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-slate-900 border border-indigo-500/50 p-6 rounded-2xl shadow-2xl flex flex-col items-center">
                <RefreshCw size={32} className="text-indigo-400 animate-spin mb-4" />
                <span className="text-slate-100 font-bold tracking-wide">{loadingText}</span>
                <span className="text-slate-500 text-xs mt-2">Analysoidaan verkkoa...</span>
              </div>
            </div>
          )}

          {/* NLP Tekstinsyöttö Modaali */}
          {isNlpModalOpen && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                  <h3 className="text-lg font-bold text-white flex items-center"><FileText className="mr-2 text-indigo-400" size={20} /> Syötä analysoitava teksti</h3>
                  <button onClick={() => setIsNlpModalOpen(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
                </div>
                <div className="p-4 flex-1">
                  <p className="text-sm text-slate-400 mb-3">Liitä tähän vapaamuotoinen teksti (uutinen, raportti, sähköposti). NLP-moottori lukee tekstin, tunnistaa siitä entiteetit ja niiden väliset kytkökset, ja piirtää ne suoraan kankaalle.</p>
                  <textarea
                    value={nlpInputText}
                    onChange={(e) => setNlpInputText(e.target.value)}
                    placeholder="Liitä teksti tähän (esim. uutisartikkeli)..."
                    className="w-full h-64 bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-300 text-sm focus:border-indigo-500 focus:outline-none resize-none"
                  />
                </div>
                <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end space-x-3">
                  <button onClick={() => setIsNlpModalOpen(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Peruuta</button>
                  <button onClick={ingestDocument} disabled={!!apiKey && !nlpInputText.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center">
                    <Sparkles size={16} className="mr-2" /> Analysoi ja luo verkko
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}