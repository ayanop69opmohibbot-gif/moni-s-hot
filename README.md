# Moni's Hot – Website + Admin Panel

Admin panel se products, categories (dono me **image upload**), orders, customers (sab users + last login), messages aur settings control hote hain.

## GitHub Pages par live karna (full dynamic) – Supabase ke sath

GitHub Pages sirf static files dikhata hai, isliye data (products, users, orders, pictures) ke liye free **Supabase** use hota hai. Admin ke changes sab visitors ko dikhte hain.

1. https://supabase.com → free project banao.
2. Supabase → **SQL Editor** → `supabase/setup.sql` ka poora content paste karke **Run**.
3. **Authentication → Providers → Email** me **"Confirm email" OFF** karo (warna signup ke baad mail confirm karni padegi).
4. **Authentication → Users → Add user** se apni admin email + strong password banao (ye hi tumhara admin login hai).
5. **SQL Editor** me ye chalao (apni email likho):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'APNI-EMAIL@example.com' on conflict do nothing;
   ```
6. **Project Settings → API** se *Project URL* aur *anon public key* copy karke `config.js` me paste karo. (`service_role` key kabhi mat daalna.)
7. Folder GitHub repo me push karo → Repo **Settings → Pages** → Branch `main` / root → Save.
8. Website kholo → normal **Login** page par apni admin **email + password** daalo → seedha Admin Panel khulega. Koi aur user admin nahi ban sakta (server-side `admins` table + Row Level Security se check hota hai; website me admin ka koi public link nahi).

Notes
- Admin login ke liye `admin / 12345` jaisa username nahi chalta; Supabase email + password (min 6, strong rakho) leta hai.
- Free Supabase project ~1 hafte inactivity par pause ho jata hai (dashboard se Resume).
- Customers ko delete karna ho to Supabase → Authentication → Users se karo.
- Order tracking timer customer ke browser me chalta hai; status admin se hi badalta hai.

## Local / Node server (alternative)
```
node server.js        # http://localhost:3000
```
`config.js` khali ho to site `server.js` se data leti hai (`data/` aur `uploads/`). Env: `ADMIN_PASSWORD`, `DATA_DIR`. Node host (Render, Railway, VPS) par chalega, GitHub Pages par nahi.

## Browser mode
Sirf files kholne (Live Server/file) par data usi browser me save hota hai – visitors ko nahi dikhta. Admin panel ke upar pill se mode dikhta hai: **Live (Supabase)**, **Live (server)** ya **Browser mode**.
