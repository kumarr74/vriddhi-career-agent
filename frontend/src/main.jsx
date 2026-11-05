import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const ACTIONS=[['approved','Approve'],['hold','Hold'],['manual','Manual'],['rejected','Do not apply']];

async function apiJson(response) {
 const raw=await response.text();
 let data;
 try { data=raw ? JSON.parse(raw) : null; } catch { data=null; }
 if(!response.ok){
  if(response.status===401 || response.status===403) throw Error('Access denied. Sign in with your invited Career Agent account.');
  throw Error(data?.detail || `Career Agent API error (HTTP ${response.status}). Check the Azure API deployment and storage settings.`);
 }
 if(data===null) throw Error('Career Agent API returned no JSON. The Azure API may not be deployed yet.');
 return data;
}

function App(){
 const [jobs,setJobs]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[showRejected,setShowRejected]=useState(false);
 const [form,setForm]=useState({title:'',company:'',source_url:''});
 const load=async()=>{setLoading(true);try{let r=await fetch(`/api/jobs?show_rejected=${showRejected}`);setJobs(await apiJson(r));setError('')}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[showRejected]);
 const decide=async(id,status)=>{try{let r=await fetch(`/api/jobs/${id}/decision`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});await apiJson(r);await load()}catch(e){setError(e.message)}};
 const add=async(e)=>{e.preventDefault();try{let r=await fetch('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});await apiJson(r);setForm({title:'',company:'',source_url:''});await load()}catch(e){setError(e.message)}};
 const tally=(s)=>jobs.filter(j=>j.status===s).length;
 return <><header><div className="identity"><span className="brand-mark">V</span><div><strong>Vriddhi Career Agent</strong><small>Personal career workflow • Development MVP</small></div></div><div className="phase">PHASE 1</div></header><main><section className="intro"><div><span className="eyebrow">MORNING REVIEW</span><h1>Opportunity dashboard</h1><p>Review discovered roles and decide which ones to pursue. No applications are submitted by this version.</p></div></section><section className="metrics"><article><small>In view</small><strong>{jobs.length}</strong></article><article><small>Approved</small><strong>{tally('approved')}</strong></article><article><small>On hold</small><strong>{tally('hold')}</strong></article><article><small>Manual</small><strong>{tally('manual')}</strong></article></section>
 <section className="panel"><div className="panel-title"><div><h2>Job review queue</h2><p>Rejected jobs are hidden by default but remain tracked to prevent duplicates.</p></div><label className="toggle"><input type="checkbox" checked={showRejected} onChange={e=>setShowRejected(e.target.checked)}/> Show rejected</label></div>
 {error&&<div role="alert" className="error">{error}</div>}
 {loading?<p>Loading…</p>:jobs.length===0?<div className="empty"><h3>No opportunities in this view</h3><p>Add a job link below to test the approval workflow. Automated scouting comes in the next iteration.</p></div>:<div className="joblist">{jobs.map(j=><article className="job" key={j.id}><div><h3>{j.title}</h3><p>{j.company} <span className="dot">•</span> <span className={'status '+j.status}>{j.status.replace('_',' ')}</span></p><a href={j.source_url} target="_blank" rel="noopener noreferrer">View original posting ↗</a></div><div className="actions">{ACTIONS.map(([value,label])=><button key={value} className={j.status===value?'selected':''} onClick={()=>decide(j.id,value)}>{label}</button>)}</div></article>)}</div>}</section>
 <section className="panel"><div className="panel-title"><div><h2>Add a job for review</h2><p>Temporary manual intake for testing. Agent 1 will populate this queue later.</p></div></div><form onSubmit={add} className="form"><label>Job title<input required minLength="3" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Director, Technology Consulting"/></label><label>Company<input required minLength="2" value={form.company} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Company"/></label><label>Posting URL<input required type="url" value={form.source_url} onChange={e=>setForm({...form,source_url:e.target.value})} placeholder="https://company.example/careers/..."/></label><button type="submit" className="primary">Add opportunity</button></form></section><footer>This is a development prototype. No credentials, resumes, or personal data should be stored until Azure authentication and durable storage are configured.</footer></main></>;
}

createRoot(document.getElementById('root')).render(<App/>);
