import React from 'react';
import { User, Building, MapPin, Shield, Activity } from 'lucide-react';

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const API_KEY = "AIzaSyAZ5mawe0picS8FEkUawxK-w83JLD6nKS8"; 

export const getNodeIcon = (type) => {
  switch (type) {
    case 'person': return <User size={16} />;
    case 'org': return <Building size={16} />;
    case 'location': return <MapPin size={16} />;
    case 'event': return <Shield size={16} />;
    default: return <Activity size={16} />;
  }
};

export const getNodeColor = (type) => {
  switch (type) {
    case 'person': return 'fill-blue-500 stroke-blue-300';
    case 'org': return 'fill-purple-500 stroke-purple-300';
    case 'location': return 'fill-emerald-500 stroke-emerald-300';
    case 'event': return 'fill-amber-500 stroke-amber-300';
    default: return 'fill-slate-500 stroke-slate-300';
  }
};

export const getRiskColor = (risk) => {
  switch (risk) {
    case 'high': return 'text-red-400';
    case 'medium': return 'text-amber-400';
    case 'low': return 'text-emerald-400';
    default: return 'text-slate-400';
  }
};

export const getOntologyProperties = (type) => {
  switch (type) {
    case 'person': return { nationality: '', ssn: '', aliases: '' };
    case 'org': return { registryNumber: '', industry: '', founded: '' };
    case 'location': return { address: '', coordinates: '', accessLevel: '' };
    case 'event': return { date: '', status: '', severity: '' };
    default: return {};
  }
};

export const defaultNodes = [
  { id: '1', label: 'Matti Virtanen', type: 'person', x: 400, y: 300, lat: 60.1699, lng: 24.9384, date: '2023-10-15', info: 'Epäilty päätekijä. Aloita tutkinta tästä.', risk: 'high', properties: { nationality: 'Suomi', ssn: '151080-XXXX', aliases: 'MaZa' } },
  { id: '2', label: 'Satama B', type: 'location', x: 200, y: 400, lat: 60.1550, lng: 24.9500, date: '2023-10-12', info: 'Havaittu epämääräistä toimintaa.', risk: 'medium', properties: { address: 'Satamakatu 1', coordinates: '60.1550, 24.9500', accessLevel: 'Rajoitettu' } }
];

export const defaultEdges = [
  { source: '1', target: '2', label: 'Havaittu alueella', date: '2023-10-14' }
];