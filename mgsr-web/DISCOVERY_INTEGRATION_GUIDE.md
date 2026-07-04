# Discovery System Integration Guide

## Quick Start

### 1. Enable Debug Panel (Testing)

Add to your war room or Find Next component:

```typescript
import { DiscoveryDebugPanel } from '@/components/DiscoveryDebugPanel';

export function WarRoomPage() {
  return (
    <>
      {/* Your existing content */}
      <DiscoveryDebugPanel visible={process.env.NODE_ENV === 'development'} />
    </>
  );
}
```

### 2. Add Refresh Recommendations UI

In your Find Next or Search component:

```typescript
import { RefreshRecommendations } from '@/components/RefreshRecommendations';

export function FindNextTab() {
  const [diversityMode, setDiversityMode] = useState<DiversityMode>('balanced');

  const handleApplyRecommendation = (rec: RefreshRecommendation) => {
    if (rec.type === 'strategy_shift') {
      setDiversityMode(rec.suggestedParams.mode as DiversityMode);
    }
    // Handle other recommendation types
  };

  return (
    <div>
      {/* Existing search UI */}
      <RefreshRecommendations 
        onApplyRecommendation={handleApplyRecommendation}
        compact={false}
      />
    </div>
  );
}
```

### 3. Track Search Patterns

After each successful search, record the pattern:

```typescript
import { recordSearchPatternMetadata } from '@/lib/searchPatternBreaker';
import { sessionTracker } from '@/lib/sessionDiversityTracker';
import { analyticsCollector } from '@/lib/discoveryAnalytics';

const handleSearchComplete = (results, query, diversityMode) => {
  const resultKeys = results.map(r => buildPlayerKey(r.url, r.name));
  const queryFingerprint = buildQueryFingerprint(query);
  
  // Track all systems
  recordSearchPatternMetadata(query, extractTokens(results));
  sessionTracker.recordSearch(queryFingerprint, resultKeys, diversityMode);
  
  analyticsCollector.recordSearch({
    queryFingerprint,
    diversityMode,
    resultsCount: results.length,
    novelResultsCount: countNovelResults(resultKeys),
    repeatPlayersCount: countRepeats(resultKeys),
    sessionId: sessionTracker.getSessionId(),
    clientDiversity: sessionTracker.getRecentDiversity(),
  });
};
```

### 4. Random Deep Dive Button

Add a button that triggers random exploration:

```typescript
import { generateRandomDeepDive, formatDeepDiveQuery, decomposeDeepDiveIntoSearchParams } from '@/lib/randomDeepDive';

function RandomDeepDiveButton() {
  const handleClick = () => {
    const { theme, query, description } = generateRandomDeepDive();
    const params = decomposeDeepDiveIntoSearchParams(query);
    
    console.log(`🎲 Exploring: ${theme}`);
    console.log(`📝 ${description}`);
    console.log(`🔍 Query: ${formatDeepDiveQuery(query)}`);
    
    // Launch search with params
    launchSearch(params);
  };

  return (
    <button 
      onClick={handleClick}
      className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700"
    >
      🎲 Random Discovery Theme
    </button>
  );
}
```

---

## System Integration Points

### Phase 1 Changes (Already Applied)
✅ Stronger novelty penalty in `discoveryDiversity.ts`
✅ Increased pool factors for discovery mode
✅ Reduced localStorage TTL
✅ Pass seen keys to Find Next server

### Creative Systems (Ready to Integrate)

#### Pattern Detection & Breaking
```typescript
import { detectPatternLooping } from '@/lib/searchPatternBreaker';

// After each search:
const looping = detectPatternLooping();
if (looping.looping) {
  showWarning(`⚠️ Pattern detected: ${looping.pattern}`);
  showSuggestion(`Try: ${looping.suggestion}`);
}
```

#### Session Diversity Tracking
```typescript
import { 
  getSessionDiversity, 
  shouldBoostExploration,
  getSuggestedMode 
} from '@/lib/sessionDiversityTracker';

// Real-time monitoring:
const diversity = getSessionDiversity(); // 0.0-1.0
if (shouldBoostExploration()) {
  // Automatically apply extra diversity boosts
}
const recommendedMode = getSuggestedMode(); // 'strict' | 'balanced' | 'discovery'
```

#### Exploration Strategies
```typescript
import { 
  selectExplorationStrategy, 
  getActiveStrategies 
} from '@/lib/explorationStrategies';

// In search pipeline:
const strategy = selectExplorationStrategy(queryFingerprint, true);
console.log(`📊 Using strategy: ${strategy}`);

// List all available strategies:
console.log(getActiveStrategies());
// Output: ['outlier_seeker', 'geographic_diversity', 'young_prospect', ...]
```

#### Analytics & Metrics
```typescript
import { getDiscoveryMetrics, getNoveltyTrend } from '@/lib/discoveryAnalytics';

// Dashboard metrics:
const report = getDiscoveryMetrics();
console.log(`📈 Novelty: ${(report.noveltyRatio * 100).toFixed(1)}%`);
console.log(`📊 Avg Diversity: ${(report.averageDiversity * 100).toFixed(1)}%`);
console.log(`🎯 Unique Players: ${report.uniquePlayersLast50}`);
console.log(`📉 Trend: ${report.repetitionTrend}`);
```

---

## Testing Protocol

### Test 1: Novelty Penalty Strength
```
1. Search for the same player 5 times
2. On 5th search, player should be heavily penalized
3. Expected: Player not in top 10 results
✓ PASS: Player appears much lower
✗ FAIL: Player appears in top rankings
```

### Test 2: Pool Factor Increase
```
1. Enable Discovery mode
2. Perform search
3. Check console: log candidatePool.length
4. Expected: ~360-540 candidates for 15 results
✓ PASS: Large candidate pool
✗ FAIL: Small pool (<200)
```

### Test 3: Pattern Detection
```
1. Search for Striker 5 times
2. System should detect pattern
3. Expected: Warning message + suggestion
✓ PASS: Pattern detected, suggestion shown
✗ FAIL: No warning
```

### Test 4: Session Diversity Tracking
```
1. Perform 5 different searches
2. Check sessionTracker.getRecentDiversity()
3. Expected: Should be >0.6 for varied searches
✓ PASS: Diversity >60%
✗ FAIL: Diversity <30%
```

### Test 5: Random Deep Dive
```
1. Click "Random Deep Dive" button 5 times
2. Each should produce different theme/query
3. Expected: 5 unique exploration themes
✓ PASS: All different themes
✗ FAIL: Same theme repeating
```

### Test 6: Seen Keys Server Sharing
```
1. Perform Find Next search with recent searches
2. In network tab, check for `seen_keys` parameter
3. Expected: Parameter present in request
✓ PASS: seen_keys in query params
✗ FAIL: Parameter missing
```

### Test 7: Real-Time Recommendations
```
1. Open RefreshRecommendations component
2. Perform various searches
3. Watch recommendations update
4. Expected: Recommendations change based on patterns
✓ PASS: Dynamic recommendations
✗ FAIL: Static recommendations
```

### Test 8: Analytics Export
```
1. Click "Export Analytics" in debug panel
2. Check browser console
3. Expected: Search analytics array printed
✓ PASS: Analytics exported
✗ FAIL: No output
```

---

## Monitoring & Debugging

### Debug Panel Features
- Real-time novelty metrics
- Session diversity percentage
- Pattern looping detection
- Analytics export button
- Random deep dive trigger
- Auto-refresh every 5 seconds

### Console Logging
Add to your search function for debugging:

```typescript
console.log('=== DISCOVERY DEBUG ===');
console.log('Query:', queryFingerprint);
console.log('Mode:', diversityMode);
console.log('Seen Keys:', seenKeys.length);
console.log('Session Diversity:', getSessionDiversity());
console.log('Pattern Loop:', detectPatternLooping());
console.log('Recommendations:', generateRefreshRecommendations());
```

### Metrics to Watch
1. **Novelty Ratio** - % of new players vs. repeats
   - Target: >70%
   - Warning: <50%
   - Critical: <30%

2. **Average Diversity** - Cross-session uniqueness
   - Target: >70%
   - Warning: 50-70%
   - Critical: <50%

3. **Unique Players (50 searches)** - Total discovered
   - Target: 150+
   - Warning: 100-150
   - Critical: <100

4. **Repetition Trend** - Direction of change
   - Goal: "Improving"
   - Watch: "Stable"
   - Alert: "Degrading"

---

## File Organization

```
src/
├── lib/
│   ├── discoveryDiversity.ts ✅ (Phase 1 updated)
│   ├── searchNoveltyMemory.ts ✅ (Phase 1 updated)
│   ├── explorationStrategies.ts ✨ (NEW)
│   ├── sessionDiversityTracker.ts ✨ (NEW)
│   ├── searchPatternBreaker.ts ✨ (NEW)
│   ├── refreshRecommender.ts ✨ (NEW)
│   ├── enhancedDiversityScorer.ts ✨ (NEW)
│   ├── randomDeepDive.ts ✨ (NEW)
│   └── discoveryAnalytics.ts ✨ (NEW)
│
├── components/
│   ├── FindNextTab.tsx ✅ (Phase 1 updated)
│   ├── RefreshRecommendations.tsx ✨ (NEW)
│   └── DiscoveryDebugPanel.tsx ✨ (NEW)
│
└── PLAYER_DISCOVERY_IMPROVEMENTS.md ✨ (NEW)
```

---

## Environment Variables (Optional)

```env
# Enable discovery debug panel
NEXT_PUBLIC_DISCOVERY_DEBUG=true

# Track exploration strategies
NEXT_PUBLIC_TRACK_STRATEGIES=true

# Analytics collection level: 'minimal' | 'standard' | 'detailed'
NEXT_PUBLIC_ANALYTICS_LEVEL=standard
```

---

## Rollout Checklist

- [ ] Phase 1 changes deployed
- [ ] Debug panel tested in development
- [ ] Pattern detection tested
- [ ] Session tracking verified
- [ ] Random deep dive working
- [ ] Recommendations displaying
- [ ] Analytics collecting data
- [ ] All metrics green in dashboard
- [ ] Performance impact acceptable (<100ms per search)
- [ ] Ready for production rollout

---

## Support & Troubleshooting

### Issue: Low novelty ratio
**Solution:** Check if seenKeys are being passed correctly. Increase pool factor further.

### Issue: Pattern detection not working
**Solution:** Ensure recordSearchPatternMetadata is called after each search with correct tokens.

### Issue: Analytics not collecting
**Solution:** Verify analyticsCollector.recordSearch is called with all required fields.

### Issue: Debug panel shows old data
**Solution:** Clear localStorage and refresh. Session tracking has 5-second auto-refresh.

---

## Next Phase (Phase 2)

When ready, implement:

1. **Per-user Firestore ledger** for persistent server-side tracking
2. **Query caching** with novelty expiration
3. **User history page** with clear button
4. **Intensity slider** for exploration vs. relevance balance
5. **A/B testing framework** to measure improvements

See `PLAYER_DISCOVERY_IMPROVEMENTS.md` for Phase 2+ details.
