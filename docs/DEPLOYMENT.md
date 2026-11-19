# เผยแพร่เว็บแบบ static

## Netlify

ใช้ `npm run build` และเลือก `dist` เป็น publish directory หรืออัปโหลด `dist` ที่สร้างเสร็จแล้ว โครงการมี `public/_redirects` สำหรับเปิดเส้นทาง เช่น `/setup` และ `/teacher` โดยตรง ตรวจโควตาตามบัญชีที่ใช้ [Netlify SPA routing](https://docs.netlify.com/resources/troubleshooting/page-not-found-error-guide/)

## Vercel

เชื่อม repository และเลือก framework Vite ให้ผล build ไปที่ `dist` โครงการมี `vercel.json` สำหรับ SPA deep links แผน Hobby ใช้ตามเงื่อนไขส่วนบุคคลและไม่เชิงพาณิชย์ของผู้ให้บริการ [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) · [Vercel Hobby](https://vercel.com/docs/plans/hobby)

## GitHub Pages

เว็บเผยแพร่ที่ [เกมคำชนคำ](https://eizing02.github.io/Thai-kum-prasom/) จากสาขา `main` ของ [Eizing02/Thai-kum-prasom](https://github.com/Eizing02/Thai-kum-prasom) ใน **Settings → Pages** ให้เลือก **GitHub Actions** เป็นแหล่งเผยแพร่ การ push ไปที่ `main` จะรันการตรวจและเผยแพร่ `dist` เมื่อผ่านครบ ดูสถานะได้ที่ [Actions](https://github.com/Eizing02/Thai-kum-prasom/actions)

ทดสอบ build ของ Pages ในเครื่องได้ด้วยคำสั่งต่อไปนี้

```powershell
npm ci
npm run build:pages
npm run preview -- --base=/Thai-kum-prasom/
```

เปิด [หน้าแรกในเครื่อง](http://localhost:4173/Thai-kum-prasom/) และ [หน้าเกี่ยวกับในเครื่อง](http://localhost:4173/Thai-kum-prasom/about/) คำสั่งสร้างไฟล์ทางเข้าสำหรับแต่ละหน้าเพื่อให้เปิดลิงก์ตรงบน Pages ได้ [Vite Static Deploy](https://vite.dev/guide/static-deploy.html#github-pages)

## ตรวจหลังเผยแพร่

1. เปิด URL ตรงของหน้าแรก หน้าเลือกบทเรียน และหน้าครู เช็กว่าไฟล์ฟอนต์และ JavaScript โหลดได้
2. ตรวจ HTTPS และสิทธิ์กล้อง โดยเฉพาะเมื่อเปิดในเว็บฝังหรือเครื่องที่โรงเรียนจัดการ ทดสอบ Chrome/Edge ก่อนและเช็กเบราว์เซอร์จริงบนมือถือ
3. อนุญาตให้โหลดโมเดลจาก `storage.googleapis.com` และ runtime จาก `cdn.jsdelivr.net` หากเครือข่ายโรงเรียนบล็อก ให้ใช้เมาส์หรือสัมผัส โฮสต์ไฟล์เองเมื่อได้ตรวจสิทธิ์แจกจ่าย ของที่ต้องเปลี่ยนคือ URL โมเดลและ WASM ใน `src/tracking/camera.ts`
4. เปิดคลังคำบนโปรไฟล์เบราว์เซอร์ใหม่ ตรวจการบันทึกและนำเข้า JSON ข้อมูลจาก localhost จะแยกจากโดเมนเผยแพร่ตามกติกาของเบราว์เซอร์
