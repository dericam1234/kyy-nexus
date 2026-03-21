import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Network, Database, Search, User, Building, MapPin, Shield, Activity, 
  ChevronRight, Maximize, Crosshair, Plus, Trash2, ZoomIn, ZoomOut, 
  RefreshCw, Globe, AlertTriangle, Save, Sparkles, ExternalLink,
  Map as MapIcon, Clock, Bell, FileText, CheckCircle2, X,
  Image as ImageIcon, Download, Upload 
} from 'lucide-react';

// --- APUFUNKTIOT JA ASETUKSET ---
const generateId = () => Math.random().toString(36).substr(2, 9);

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

// --- WEB MERCATOR -PROJEKTIOT (Aitojen koordinaattien muunnos) ---
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
    case 'person': return { nationality: '', ssn: '', aliases: '' };
    case 'org': return { registryNumber: '', industry: '', founded: '' };
    case 'location': return { address: '', coordinates: '', accessLevel: '' };
    case 'event': return { date: '', status: '', severity: '' };
    default: return {};
  }
};

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
  const [mapBackground, setMapBackground] = useState(() => localStorage.getItem('nexus_map_bg_v2') || null);
  const [showRealMap, setShowRealMap] = useState(() => JSON.parse(localStorage.getItem('nexus_realmap_v2')) || false);
  
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [alerts, setAlerts] = useState([]);
  const [showAlerts, setShowAlerts] = useState(false);
  
  // Alustetaan kamerat älykkäästi (Karttakamera keskitetään Suomeen oletuksena)
  const [cameras, setCameras] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    const initZoom = 8000;
    return {
      graph: { x: 0, y: 0, zoom: 1 },
      map: { x: w / 2 - getMapX(24.9384) * initZoom, y: h / 2 - getMapY(60.1699) * initZoom, zoom: initZoom }
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

  useEffect(() => {
    localStorage.setItem('nexus_nodes_v2', JSON.stringify(nodes));
    localStorage.setItem('nexus_edges_v2', JSON.stringify(edges));
    localStorage.setItem('nexus_realmap_v2', JSON.stringify(showRealMap));

    try {
      if (mapBackground) localStorage.setItem('nexus_map_bg_v2', mapBackground);
      else localStorage.removeItem('nexus_map_bg_v2');
    } catch (e) {
      console.warn("Karttakuva liian suuri.");
    }

    const newAlerts = [];
    edges.forEach(edge => {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (source && target && source.risk === 'high' && ['location', 'event'].includes(target.type)) {
        newAlerts.push({ id: `${source.id}-${target.id}`, level: 'critical', message: `Kriittinen yhteys: Korkean riskin kohde (${source.label}) kytkeytyy solmuun ${target.label}.` });
      }
    });

    nodes.forEach(node => {
      if (node.risk === 'high' && !edges.some(e => e.source === node.id || e.target === node.id)) {
        newAlerts.push({ id: `isolated-${node.id}`, level: 'warning', message: `Havaittu eristetty korkean riskin kohde: ${node.label}. Suosittelemme OSINT-tiedustelua.` });
      }
    });

    if (JSON.stringify(alerts.map(a=>a.id)) !== JSON.stringify(newAlerts.map(a=>a.id))) setAlerts(newAlerts);
  }, [nodes, edges, mapBackground, showRealMap]);

  // Hakee näytöllä näkyvät OpenStreetMap-tiilet lennosta!
  const getVisibleTiles = () => {
    if (activeTab !== 'map' || !showRealMap) return [];
    
    // Määritetään oikea OSM zoomaustaso (0-19) SVG:n zoomauskertoimesta
    const z = Math.max(0, Math.min(19, Math.floor(Math.log2(camera.zoom))));
    const tileSizeWorld = 256 / Math.pow(2, z);
    
    const windowW = window.innerWidth || 1920;
    const windowH = window.innerHeight || 1080;
    
    const minWX = -camera.x / camera.zoom;
    const minWY = -camera.y / camera.zoom;
    const maxWX = (windowW - camera.x) / camera.zoom;
    const maxWY = (windowH - camera.y) / camera.zoom;
    
    const minTx = Math.max(0, Math.floor(minWX / tileSizeWorld));
    const minTy = Math.max(0, Math.floor(minWY / tileSizeWorld));
    const maxTx = Math.min(Math.pow(2, z) - 1, Math.floor(maxWX / tileSizeWorld));
    const maxTy = Math.min(Math.pow(2, z) - 1, Math.floor(maxWY / tileSizeWorld));
    
    const tiles = [];
    let count = 0;
    for (let x = minTx; x <= maxTx; x++) {
      for (let y = minTy; y <= maxTy; y++) {
        if (count++ < 200) tiles.push({ x, y, z }); // Estetään selaimen kaatuminen yli-zoomauksissa
      }
    }
    return tiles;
  };

  const performZoom = (zoomFactor, centerX, centerY) => {
    updateCamera(prev => {
      let newZoom = prev.zoom * zoomFactor;
      // Karttatilassa zoomaus voi olla valtava (jotta katutaso näkyy)
      const maxZoom = activeTab === 'map' ? 5000000 : 200;
      const minZoom = activeTab === 'map' ? 10 : 0.05;
      newZoom = Math.max(minZoom, Math.min(newZoom, maxZoom));
      
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
      performZoom(1.5, rect.width / 2, rect.height / 2);
    }
  };

  const handleZoomOutButton = () => {
    if(svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      performZoom(1 / 1.5, rect.width / 2, rect.height / 2);
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
      const movementX = e.movementX / camera.zoom;
      const movementY = e.movementY / camera.zoom;
      setNodes(prev => prev.map(n => 
        n.id === draggingNode ? { ...n, x: n.x + movementX, y: n.y + movementY } : n
      ));
    } else if (isPanning) {
      updateCamera(prev => ({ ...prev, x: prev.x + e.movementX, y: prev.y + e.movementY }));
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

  const exportSession = () => {
    const sessionData = { nodes, edges, mapBackground, showRealMap };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessionData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `nexus_session_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importSession = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const session = JSON.parse(event.target.result);
        if (session.nodes) setNodes(session.nodes);
        if (session.edges) setEdges(session.edges);
        if (session.mapBackground !== undefined) setMapBackground(session.mapBackground);
        if (session.showRealMap !== undefined) setShowRealMap(session.showRealMap);
        alert("Sessio ladattu onnistuneesti!");
      } catch (err) {
        alert("Virhe tiedoston lukemisessa. Varmista että kyseessä on oikea .json-tiedosto.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const clearSession = () => {
    if (window.confirm("Haluatko varmasti tyhjentää koko session? Kaikki tiedot poistetaan pysyvästi.")) {
      localStorage.removeItem('nexus_nodes_v2');
      localStorage.removeItem('nexus_edges_v2');
      localStorage.removeItem('nexus_map_bg_v2');
      setNodes(defaultNodes);
      setEdges(defaultEdges);
      setMapBackground(null);
      setSelectedNodeId(null);
      const w = window.innerWidth;
      const h = window.innerHeight;
      setCameras({ graph: { x: 0, y: 0, zoom: 1 }, map: { x: w/2 - getMapX(24.94)*8000, y: h/2 - getMapY(60.16)*8000, zoom: 8000 } });
      setSearchQuery('');
    }
  };

  const handleMapBgUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setMapBackground(event.target.result);
    reader.readAsDataURL(file);
  };

  const addNewNode = () => {
    const worldX = (-camera.x + window.innerWidth / 2) / camera.zoom;
    const worldY = (-camera.y + window.innerHeight / 2) / camera.zoom;
    
    let newLat = 60 + (Math.random() * 2 - 1);
    let newLng = 24 + (Math.random() * 2 - 1);
    
    // Jos olemme karttatilassa, uusi solmu tippuu TARKALLEEN siihen missä kamera on
    if (activeTab === 'map') {
        newLng = reverseMapXToLng(worldX);
        newLat = reverseMapYToLat(worldY);
    }

    const newNode = {
      id: generateId(), label: 'Uusi Entiteetti', type: 'person',
      x: worldX, y: worldY, lat: newLat, lng: newLng,
      date: new Date().toISOString().split('T')[0],
      info: 'Uusi manuaalisesti luotu entiteetti.', risk: 'low',
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
    setNodes(nodes.map(n => n.id === id ? { ...n, properties: { ...n.properties, [field]: value } } : n));
  };

  // --- API / SIMULAATIO INTEGRAATIOT ---
  const ingestDocument = async () => { /* ... (Säilytetty ennallaan) ... */ };
  const transformAIOsint = async (sourceNode) => { /* ... (Säilytetty ennallaan) ... */ };
  const transformFindCompanies = async (sourceNode) => { /* ... (Säilytetty ennallaan) ... */ };
  const transformWikipediaSearch = async (sourceNode) => { /* ... (Säilytetty ennallaan) ... */ };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const filteredNodes = nodes.filter(n => 
    n.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen w-full bg-[#0B1120] text-slate-300 font-sans overflow-hidden select-none">
      
      {/* VASEMMAN PALKIN NAVIGAATIO */}
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
          <button onClick={addNewNode} className="w-full py-3 flex justify-center text-emerald-400 hover:text-emerald-300 bg-emerald-900/10 hover:bg-emerald-900/30" title="Lisää entiteetti tähän koordinaattiin"><Plus size={22} /></button>
        </div>
      </div>

      {/* PÄÄALUE */}
      <div className="flex-1 flex flex-col h-full relative">
        <div className="h-14 bg-slate-900/95 backdrop-blur border-b border-slate-800 flex items-center justify-between px-6 z-30">
          <div className="flex items-center space-x-6">
            <h1 className="text-lg font-semibold tracking-wider text-slate-100 flex items-center">
              NEXUS <span className="text-indigo-400 ml-2 font-normal text-xs px-2 py-0.5 bg-indigo-500/10 rounded border border-indigo-500/20">GOTHAM EDITION</span>
            </h1>
            
            {(activeTab === 'graph' || activeTab === 'map') && (
              <div className="flex items-center space-x-2 border-l border-slate-700 pl-6">
                <button onClick={handleZoomInButton} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white" title="Lähennä"><ZoomIn size={18} /></button>
                <button onClick={handleZoomOutButton} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white" title="Loitonna"><ZoomOut size={18} /></button>
                <button onClick={() => updateCamera({ x: activeTab === 'map' ? (window.innerWidth/2 - getMapX(24.94)*8000) : 0, y: activeTab === 'map' ? (window.innerHeight/2 - getMapY(60.16)*8000) : 0, zoom: activeTab === 'map' ? 8000 : 1 })} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white ml-2 mr-2 text-xs font-medium flex items-center" title="Palauta näkymä">
                  <Maximize size={14} className="mr-1" /> Keskitä
                </button>
                
                <div className="w-px h-5 bg-slate-700 mx-2"></div>
                <button onClick={exportSession} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-indigo-400" title="Lataa sessio koneelle (Export)"><Download size={18} /></button>
                <label className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 cursor-pointer" title="Avaa sessio tiedostosta (Import)">
                  <Upload size={18} /><input type="file" accept=".json" className="hidden" onChange={importSession} />
                </label>
                <div className="w-px h-5 bg-slate-700 mx-2"></div>
                <button onClick={clearSession} className="p-1.5 rounded hover:bg-red-900/30 text-slate-400 hover:text-red-400" title="Tyhjennä sessio (Nollaa työtila)"><Trash2 size={18} /></button>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="relative">
              <button onClick={() => setShowAlerts(!showAlerts)} className={`relative p-2 rounded-full transition-colors ${alerts.length > 0 ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'text-slate-500 hover:bg-slate-800'}`}>
                <Bell size={18} />
                {alerts.length > 0 && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border border-slate-900"></span>}
              </button>
              
              {showAlerts && (
                <div className="absolute right-0 top-10 w-80 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg overflow-hidden z-50">
                  <div className="bg-slate-800 p-3 text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-700">Järjestelmähälytykset ({alerts.length})</div>
                  <div className="max-h-64 overflow-y-auto">
                    {alerts.length === 0 ? <div className="p-4 text-sm text-slate-500 text-center">Ei aktiivisia hälytyksiä.</div> : alerts.map(alert => (
                        <div key={alert.id} className={`p-3 border-b border-slate-800/50 text-sm flex items-start ${alert.level === 'critical' ? 'bg-red-950/20' : 'bg-amber-950/20'}`}>
                          <AlertTriangle size={16} className={`mr-2 flex-shrink-0 mt-0.5 ${alert.level === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                          <span className="text-slate-300">{alert.message}</span>
                        </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={16} />
              <input type="text" placeholder="Suodata näkymää..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-slate-950 border border-slate-700 text-sm rounded-full pl-9 pr-4 py-1.5 focus:outline-none focus:border-indigo-500 w-64" />
            </div>
          </div>
        </div>

        {/* TYÖTILAT */}
        <div className="flex-1 relative overflow-hidden bg-[#0a0f18]">
          
          {(activeTab === 'graph' || activeTab === 'map') && (
            <>
              {/* TAUSTAT */}
              {activeTab === 'graph' ? (
                <div className="absolute inset-0 pointer-events-none opacity-10" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.2) 1px, transparent 1px)', backgroundSize: `${40 * camera.zoom}px ${40 * camera.zoom}px`, backgroundPosition: `${camera.x}px ${camera.y}px` }}></div>
              ) : (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
                  {mapBackground && !showRealMap ? (
                    <img src={mapBackground} alt="Custom" className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none" />
                  ) : !showRealMap ? (
                    <div className="absolute inset-0 opacity-20 bg-emerald-950/10" style={{ backgroundImage: 'radial-gradient(circle at center, transparent 0, transparent 20px, #10b981 21px, transparent 22px)', backgroundSize: '200px 200px', backgroundPosition: 'center' }}></div>
                  ) : null}
                  {!showRealMap && <div className="absolute top-4 left-4 text-emerald-500/50 font-mono text-xs tracking-widest pointer-events-none">GEOSPATIAL PROJECTION // LAT/LNG MAPPING</div>}
                  {!showRealMap && <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)', backgroundSize: '100px 100px', backgroundPosition: `${camera.x}px ${camera.y}px` }}></div>}
                </div>
              )}

              {/* KARTTATILAN KONTROLLIT */}
              {activeTab === 'map' && (
                <div className="absolute bottom-6 left-6 z-20 flex flex-col items-start pointer-events-auto space-y-3">
                  <button onClick={(e) => { e.stopPropagation(); setShowRealMap(!showRealMap); }} className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg cursor-pointer border shadow-xl transition-colors backdrop-blur ${showRealMap ? 'bg-indigo-600/90 border-indigo-500 text-white shadow-indigo-500/20' : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                     <MapIcon size={16} className={showRealMap ? "text-white" : "text-emerald-400"} />
                     <span className="text-xs font-bold tracking-wide">OIKEA KARTTA {showRealMap ? 'PÄÄLLÄ' : 'POIS'}</span>
                  </button>

                  <label className="flex items-center space-x-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg cursor-pointer border border-slate-700 shadow-xl transition-colors backdrop-blur">
                    <ImageIcon size={16} className="text-emerald-400" />
                    <span className="text-xs font-medium">Lataa oma karttakuva</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleMapBgUpload} />
                  </label>
                  {mapBackground && (
                    <button onClick={(e) => { e.stopPropagation(); setMapBackground(null); }} className="mt-2 text-xs text-red-400 hover:text-red-300 flex items-center bg-slate-900/80 px-2 py-1 rounded">
                      <Trash2 size={12} className="mr-1" /> Poista kuva
                    </button>
                  )}
                </div>
              )}
              
              {/* Oikean kartan attribuutio */}
              {activeTab === 'map' && showRealMap && (
                <div className="absolute bottom-2 right-[330px] z-20 text-[10px] text-slate-500 pointer-events-none">
                  © OpenStreetMap contributors
                </div>
              )}

              <svg 
                ref={svgRef}
                className={`absolute inset-0 w-full h-full ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
                onWheel={handleWheel} onMouseDown={handleMouseDownCanvas} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onClick={handleBackgroundClick}
              >
                <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
                  
                  {/* OIKEAT KARTTATIILET (Suodatettu dark modeksi) */}
                  {activeTab === 'map' && showRealMap && (
                    <g className="filter invert hue-rotate-180 brightness-75 contrast-125 opacity-70">
                      {getVisibleTiles().map(t => {
                        const tileSizeWorld = 256 / Math.pow(2, t.z);
                        // + 1/camera.zoom lisää tarkalleen 1 näytön pikselin päällekkäisyyttä tiilille, jotta saumat piiloutuvat!
                        const visualOverlap = 1 / camera.zoom; 
                        return (
                          <image
                            key={`${t.z}-${t.x}-${t.y}`}
                            href={`https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`}
                            x={t.x * tileSizeWorld}
                            y={t.y * tileSizeWorld}
                            width={tileSizeWorld + visualOverlap}
                            height={tileSizeWorld + visualOverlap}
                            preserveAspectRatio="none"
                          />
                        );
                      })}
                    </g>
                  )}

                  {(() => {
                    const inverseZoom = camera.zoom > 1 ? 1 / camera.zoom : 1;
                    return (
                      <>
                        {/* Edges */}
                        {edges.map((edge, i) => {
                          const sourceNode = nodes.find(n => n.id === edge.source);
                          const targetNode = nodes.find(n => n.id === edge.target);
                          if (!sourceNode || !targetNode) return null;
                          
                          // HUOM: Aito maantieteellinen projektio!
                          const sX = activeTab === 'map' ? getMapX(sourceNode.lng) : sourceNode.x;
                          const sY = activeTab === 'map' ? getMapY(sourceNode.lat) : sourceNode.y;
                          const tX = activeTab === 'map' ? getMapX(targetNode.lng) : targetNode.x;
                          const tY = activeTab === 'map' ? getMapY(targetNode.lat) : targetNode.y;

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

                          const posX = activeTab === 'map' ? getMapX(node.lng) : node.x;
                          const posY = activeTab === 'map' ? getMapY(node.lat) : node.y;

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
                              
                              {activeTab === 'map' && isSelected && (
                                <text y="60" textAnchor="middle" className="text-[9px] fill-emerald-400 font-mono pointer-events-none drop-shadow-md bg-black">
                                  {Number(node.lat).toFixed(4)}, {Number(node.lng).toFixed(4)}
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

          {/* AIKAJANA JA TIETOKANTA... */}
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

          {/* OIKEA SIVUPALKKI */}
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

          {isLoading && (
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-slate-900 border border-indigo-500/50 p-6 rounded-2xl shadow-2xl flex flex-col items-center">
                <RefreshCw size={32} className="text-indigo-400 animate-spin mb-4" />
                <span className="text-slate-100 font-bold tracking-wide">{loadingText}</span>
                <span className="text-slate-500 text-xs mt-2">Analysoidaan verkkoa...</span>
              </div>
            </div>
          )}

          {isNlpModalOpen && (
            <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                  <h3 className="text-lg font-bold text-white flex items-center"><FileText className="mr-2 text-indigo-400" size={20} /> Syötä analysoitava teksti</h3>
                  <button onClick={() => setIsNlpModalOpen(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
                </div>
                <div className="p-4 flex-1">
                  <p className="text-sm text-slate-400 mb-3">Liitä tähän vapaamuotoinen teksti. NLP-moottori lukee tekstin, tunnistaa entiteetit ja piirtää ne suoraan kankaalle.</p>
                  <textarea
                    value={nlpInputText}
                    onChange={(e) => setNlpInputText(e.target.value)}
                    placeholder="Liitä teksti tähän..."
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