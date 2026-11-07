// ============================================================================
//  SITE CONFIG  -  GitHub Pages (static hosting) par site dynamic chalane ke liye
// ============================================================================
//  1) supabase.com par free project banao  2) supabase/setup.sql run karo
//  3) Project Settings > API se "Project URL" aur "anon public" key yahan paste karo.
//  anon key public hoti hai (safe) - security setup.sql ke Row Level Security se aati hai.
//  KABHI "service_role" key yahan mat daalna.
//  Dono khali chhodo to site purane tareeke se chalegi (node server.js ya browser mode).
window.SITE_CONFIG = {
       supabaseUrl: "https://kaaadfzxsjnagfykyzeg.supabase.co",
    supabaseAnonKey: "sb_publishable_-a4EefY94faStVrLE_AqOQ_dFv3NIXv",
    imageBucket: "product-images"
};
