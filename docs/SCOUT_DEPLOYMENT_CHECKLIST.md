# Scout Deployment Checklist

## Verify Everything Is Live

### 1. Scout Server (Render)
- **URL:** https://football-scout-server-l38w.onrender.com
- **SCOUT_SERVER_URL:** Set in Vercel/Firebase without trailing slash (e.g. `https://...onrender.com` not `...com/`). The app normalizes this; double-slash URLs cause 404.
- **Test:** `curl "https://football-scout-server-l38w.onrender.com/recruitment?position=CF&transfer_fee=Free%2FFree%20loan&request_id=test1&limit=3"`
- **Expected:** Different players for `request_id=test1` vs `request_id=test2`
- **Latest commits:** Result rotation, Free/loan availability scoring, salary_range, request_id

### 2. Web App (Vercel)
- **Must deploy from `main`** for scout changes to be live
- **Files that must be on main:**
  - `mgsr-web/src/lib/scoutApi.ts` — passes `requestId`, `salaryRange`, `cache: 'no-store'`
  - `mgsr-web/src/app/requests/page.tsx` — passes `requestId: r.id`, `salaryRange: r.salaryRange`
  - `mgsr-web/src/app/api/scout/recruitment/route.ts` — Cache-Control headers

### 3. Test Flow
1. Open Requests page
2. Create/open a request with position (e.g. CF) and transfer fee (e.g. Free/Free loan)
3. Click "Find players using AI Scout"
4. Note the players
5. Open a **different** request (different club) with same criteria
6. Click "Find players using AI Scout"
7. **Expected:** Different player list (rotation by request_id)

### 4. If Still Same Results
- **Hard refresh:** Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- **Check Vercel:** Which branch is production? Merge to that branch and redeploy
- **Check browser DevTools → Network:** Inspect the `/api/scout/recruitment` request — does it include `request_id` in the URL?
