"use client";

import { use, useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { HlsPlayer } from "@/components/hls-player";

export default function MonitorPage({ params }) {
  const { token } = use(params);
  const [data,setData]=useState(null); const [error,setError]=useState("");
  useEffect(()=>{fetch(`${API_URL}/api/monitor/${encodeURIComponent(token)}`,{credentials:'include'}).then(r=>r.ok?r.json():Promise.reject()).then(setData).catch(()=>setError('لینک مانیتور نامعتبر یا غیرفعال است.'))},[token]);
  if(error)return <div className="min-h-screen grid place-items-center">{error}</div>;
  if(!data)return <div className="min-h-screen grid place-items-center">در حال بارگذاری...</div>;
  const src=`${API_URL}/api/monitor/${encodeURIComponent(token)}/live/index.m3u8`;
  return <main className="min-h-screen bg-black text-white p-4"><div className="max-w-5xl mx-auto"><div className="mb-3"><h1 className="text-xl font-bold">{data.streamTitle||data.channel}</h1><p className="text-sm text-white/60">{data.isLive?'LIVE':'OFFLINE'}</p></div>{data.isLive?<div className="aspect-video rounded-xl overflow-hidden"><HlsPlayer src={src} className="w-full h-full"/></div>:<div className="aspect-video rounded-xl bg-white/5 grid place-items-center">استریم آفلاین است.</div>}</div></main>;
}
