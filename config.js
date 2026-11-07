// ============================================================================
//  SITE CONFIG  -  GitHub Pages (static hosting) par site dynamic chalane ke liye
// ============================================================================
//  1) supabase.com par free project banao  2) supabase/setup.sql run karo
//  3) Project Settings > API se "Project URL" aur "anon public" key yahan paste karo.
//  anon key public hoti hai (safe) - security setup.sql ke Row Level Security se aati hai.
//  KABHI "service_role" key yahan mat daalna.
//  Dono khali chhodo to site purane tareeke se chalegi (node server.js ya browser mode).
window.SITE_CONFIG = {
    supabaseUrl: "",        // e.g. "https://abcdxyz.supabase.co"
    supabaseAnonKey: "",    // e.g. "eyJhbGciOi..."
    imageBucket: "product-images"
};
