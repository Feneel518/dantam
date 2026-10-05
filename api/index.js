import express from 'express';
import { resolve } from 'node:path';
import { app, errorHandler } from '../server/app.js';
import { one } from '../server/db.js';
import { clinicSite } from '../server/public-site.js';
// The function handles API and clinic pages; Vercel serves built assets directly.
app.get('/',async(req,res,next)=>{
 const hostname=req.hostname.toLowerCase();
 const row=await one('SELECT c.* FROM clinic_domains d JOIN clinics c ON c.id=d.clinic_id WHERE d.hostname=? AND d.verified_at IS NOT NULL AND c.published=1',[hostname]);
 if(row)return res.type('html').send(clinicSite(row));next();
});
app.use(express.static(resolve('dist'),{index:false}));
app.get('/{*path}',(req,res)=>res.sendFile(resolve('dist/index.html')));
app.use(errorHandler);
export default app;
